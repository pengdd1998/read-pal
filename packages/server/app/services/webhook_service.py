"""Webhook business logic — CRUD, delivery, logging."""

import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import re
import secrets
import socket
import time
from urllib.parse import urlparse
from uuid import UUID
from app.middleware.exception_handlers import NotFoundError

import httpx
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.webhook import Webhook, WebhookDeliveryLog
from app.schemas.webhook import WebhookCreate, WebhookUpdate
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.webhooks')


# Matches the userinfo component (user:pass@) of a URL so we can strip it
# before logging. Users sometimes embed HTTP basic-auth creds in webhook URLs;
# without redaction those land in app logs.
_USERINFO_RE = re.compile(r'^([a-zA-Z][a-zA-Z0-9+.\-]*://)([^@/@:]+(?::[^@/@]*)?@)')


def _redact_url(url: str) -> str:
    """Strip basic-auth userinfo from a URL for safe logging.

    ``https://key:secret@host/path`` → ``https://***@host/path``
    """
    if not url:
        return url
    return _USERINFO_RE.sub(lambda m: f'{m.group(1)}***@', url, count=1)


# IP ranges blocked for webhook delivery (SSRF defense). Beyond RFC1918, this
# also blocks 0.0.0.0/8 (unspecified — kernel may route to localhost),
# CGNAT 100.64.0.0/10, multicast, and IPv6-mapped IPv4.
_BLOCKED_NETWORKS = (
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    ipaddress.ip_network('127.0.0.0/8'),          # IPv4 loopback
    ipaddress.ip_network('169.254.0.0/16'),        # link-local + cloud metadata
    ipaddress.ip_network('0.0.0.0/8'),             # unspecified — routes to localhost on some kernels
    ipaddress.ip_network('100.64.0.0/10'),         # CGNAT
    ipaddress.ip_network('224.0.0.0/4'),           # multicast
    ipaddress.ip_network('::1/128'),               # IPv6 loopback
    ipaddress.ip_network('fe80::/10'),             # IPv6 link-local
    ipaddress.ip_network('fc00::/7'),              # IPv6 ULA
    ipaddress.ip_network('::ffff:0:0/96'),         # IPv6-mapped IPv4 (re-check inside)
)


def _ip_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True if the IP falls in any blocked network."""
    # IPv6-mapped IPv4 — unwrap and re-check against IPv4 rules.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    for net in _BLOCKED_NETWORKS:
        if ip in net:
            return True
    return False


async def create_webhook(
    db: AsyncSession,
    user_id: UUID,
    data: WebhookCreate,
) -> Webhook:
    """Create a new webhook with auto-generated secret if not provided."""
    secret = data.secret or secrets.token_urlsafe(32)
    webhook = Webhook(
        user_id=user_id,
        url=str(data.url),
        events=data.events,
        secret=secret,
    )
    db.add(webhook)
    await db.flush()
    await db.refresh(webhook)
    logger.info('Webhook created: id=%s user=%s url=%s events=%s', webhook.id, user_id, _redact_url(webhook.url), webhook.events)
    return webhook


async def list_webhooks(
    db: AsyncSession,
    user_id: UUID,
) -> list[Webhook]:
    """List all webhooks for a user."""
    try:
        async with db_error_guard('list_webhooks', user_id=str(user_id)):
            result = await db.execute(
                select(Webhook)
                .where(Webhook.user_id == user_id)
                .order_by(Webhook.created_at.desc()),
            )
            return list(result.scalars().all())
    except DBAPIError:
        logger.warning('webhook_service.get_webhooks_for_book failed user_id=%s', user_id, exc_info=True)
        return []


async def get_webhook(
    db: AsyncSession,
    user_id: UUID,
    webhook_id: UUID,
) -> Webhook:
    """Get a single webhook by ID, verifying ownership."""
    try:
        async with db_error_guard('get_webhook', user_id=str(user_id), webhook_id=str(webhook_id)):
            result = await db.execute(
                select(Webhook).where(
                    Webhook.id == webhook_id,
                    Webhook.user_id == user_id,
                ),
            )
            webhook = result.scalar_one_or_none()
    except DBAPIError:
        logger.warning('webhook query failed', exc_info=True)
        raise  # DB failure — sanitized 500 via the global handler
    if webhook is None:
        raise NotFoundError('Webhook not found')
    return webhook


async def update_webhook(
    db: AsyncSession,
    user_id: UUID,
    webhook_id: UUID,
    data: WebhookUpdate,
) -> Webhook:
    """Update a webhook. Verifies ownership."""
    try:
        async with db_error_guard('update_webhook', user_id=str(user_id), webhook_id=str(webhook_id)):
            result = await db.execute(
                select(Webhook).where(
                    Webhook.id == webhook_id,
                    Webhook.user_id == user_id,
                ),
            )
            webhook = result.scalar_one_or_none()
    except DBAPIError:
        logger.warning('webhook query failed', exc_info=True)
        raise  # DB failure — sanitized 500 via the global handler
    if webhook is None:
        raise NotFoundError('Webhook not found')

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == 'url' and value is not None:
            setattr(webhook, field, str(value))
        else:
            setattr(webhook, field, value)

    await db.flush()
    await db.refresh(webhook)
    logger.info('Webhook updated: id=%s user=%s fields=%s', webhook_id, user_id, list(update_data.keys()))
    return webhook


async def delete_webhook(
    db: AsyncSession,
    user_id: UUID,
    webhook_id: UUID,
) -> None:
    """Delete a webhook. Verifies ownership."""
    try:
        async with db_error_guard('delete_webhook', user_id=str(user_id), webhook_id=str(webhook_id)):
            result = await db.execute(
                select(Webhook).where(
                    Webhook.id == webhook_id,
                    Webhook.user_id == user_id,
                ),
            )
            webhook = result.scalar_one_or_none()
    except DBAPIError:
        logger.warning('webhook query failed', exc_info=True)
        raise  # DB failure — sanitized 500 via the global handler
    if webhook is None:
        raise NotFoundError('Webhook not found')

    await db.delete(webhook)
    await db.flush()
    logger.info('Webhook deleted: id=%s user=%s', webhook_id, user_id)


async def get_delivery_logs(
    db: AsyncSession,
    user_id: UUID,
    webhook_id: UUID,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[WebhookDeliveryLog], int]:
    """Get delivery logs for a webhook. Verifies ownership."""
    try:
        async with db_error_guard('get_delivery_logs', user_id=str(user_id), webhook_id=str(webhook_id)):
            # Verify ownership
            wh_result = await db.execute(
                select(Webhook.id).where(
                    Webhook.id == webhook_id,
                    Webhook.user_id == user_id,
                ),
            )
            if wh_result.scalar_one_or_none() is None:
                raise NotFoundError('Webhook not found')

            count_result = await db.execute(
                select(func.count())
                .select_from(WebhookDeliveryLog)
                .where(WebhookDeliveryLog.webhook_id == webhook_id),
            )
            total = count_result.scalar() or 0

            offset = (page - 1) * per_page
            result = await db.execute(
                select(WebhookDeliveryLog)
                .where(WebhookDeliveryLog.webhook_id == webhook_id)
                .order_by(WebhookDeliveryLog.created_at.desc())
                .offset(offset)
                .limit(per_page),
            )
            return list(result.scalars().all()), total
    except DBAPIError:
        logger.warning('webhook_service.list_webhooks_paginated failed', exc_info=True)
        return [], 0


async def _is_safe_webhook_url(url: str) -> bool:
    """Block webhook URLs targeting internal/private networks.

    Note: there is still a TOCTOU window between this check and the actual
    httpx request (DNS may be rebound). ``_deliver_with_retries`` re-runs this
    check before each attempt to minimize the window.
    """
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return False
        # Block non-HTTP schemes
        if parsed.scheme not in ('http', 'https'):
            return False
        # Resolve asynchronously to avoid blocking the event loop
        loop = asyncio.get_running_loop()
        resolved = await loop.getaddrinfo(hostname, None, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
        for _, _, _, _, addr in resolved:
            ip = ipaddress.ip_address(addr[0])
            if _ip_blocked(ip):
                return False
    except (socket.gaierror, ValueError, OSError) as exc:
        logger.warning('webhook_url_resolution_failed url=%s: %s', _redact_url(url), str(exc)[:100])
        return False
    return True


async def _deliver_with_retries(
    url: str,
    event: str,
    body: dict,
    headers: dict,
    start: float,
    max_retries: int = 3,
) -> tuple[int | None, int, str | None]:
    """Execute HTTP POST with retry loop and exponential backoff.

    Returns (status_code, duration_ms, error).

    SSRF defense: re-validate the URL before each attempt to minimize the
    DNS-rebinding TOCTOU window between the initial validation in
    ``deliver_webhook`` and the actual connection.
    """
    last_error: str | None = None
    redacted = _redact_url(url)
    for attempt in range(max_retries + 1):
        # Re-check before each attempt — DNS may have been rebound between
        # the initial validation and this retry.
        if not await _is_safe_webhook_url(url):
            logger.warning('webhook.blocked_internal_url_during_delivery url=%s attempt=%d', redacted, attempt + 1)
            return None, 0, 'Webhook URL targets internal network'
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    json=body,
                    headers=headers,
                )
            duration_ms = int((time.monotonic() - start) * 1000)
            if response.status_code >= 500 and attempt < max_retries:
                delay = 2 ** attempt
                logger.warning('Webhook got %d, retry %d/%d in %ds: url=%s', response.status_code, attempt + 1, max_retries, delay, redacted)
                await asyncio.sleep(delay)
                continue
            logger.info('Webhook delivered: url=%s event=%s status=%d duration=%dms', redacted, event, response.status_code, duration_ms)
            return response.status_code, duration_ms, None
        except (httpx.HTTPError, httpx.TimeoutException, ConnectionError) as exc:
            last_error = str(exc)
            if attempt < max_retries:
                delay = 2 ** attempt
                logger.warning('Webhook delivery attempt %d/%d failed, retrying in %ds: url=%s error=%s', attempt + 1, max_retries + 1, delay, redacted, str(exc)[:100])
                await asyncio.sleep(delay)
            else:
                duration_ms = int((time.monotonic() - start) * 1000)
                logger.error('Webhook delivery failed after %d attempts: url=%s event=%s duration=%dms error=%s', max_retries + 1, redacted, event, duration_ms, exc)
                return None, duration_ms, last_error
    # Should not reach here, but safety fallback
    duration_ms = int((time.monotonic() - start) * 1000)
    return None, duration_ms, last_error


async def deliver_webhook(
    webhook: Webhook,
    event: str,
    payload: dict,
) -> tuple[int | None, int, str | None]:
    """Deliver a webhook via HTTP POST with HMAC-SHA256 signature.

    Retries up to 3 times with exponential backoff on transient failures.
    Returns (status_code, duration_ms, error).
    """
    body_str = json.dumps(payload, separators=(',', ':'), sort_keys=True)
    signature = hmac.new(
        webhook.secret.encode(),
        body_str.encode(),
        hashlib.sha256,
    ).hexdigest()

    headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': f'sha256={signature}',
        'X-Webhook-Event': event,
    }

    if not await _is_safe_webhook_url(webhook.url):
        logger.warning('webhook.blocked_internal_url url=%s', _redact_url(webhook.url))
        return None, 0, 'Webhook URL targets internal network'

    start = time.monotonic()
    return await _deliver_with_retries(
        url=webhook.url,
        event=event,
        body=payload,
        headers=headers,
        start=start,
    )
