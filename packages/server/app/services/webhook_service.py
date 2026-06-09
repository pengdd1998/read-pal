"""Webhook business logic — CRUD, delivery, logging."""

import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import secrets
import socket
import time
from urllib.parse import urlparse
from uuid import UUID

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.webhook import Webhook, WebhookDeliveryLog
from app.schemas.webhook import WebhookCreate, WebhookUpdate

logger = logging.getLogger('read-pal.webhooks')


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
    logger.info('Webhook created: id=%s user=%s url=%s events=%s', webhook.id, user_id, webhook.url, webhook.events)
    return webhook


async def list_webhooks(
    db: AsyncSession,
    user_id: UUID,
) -> list[Webhook]:
    """List all webhooks for a user."""
    result = await db.execute(
        select(Webhook)
        .where(Webhook.user_id == user_id)
        .order_by(Webhook.created_at.desc()),
    )
    return list(result.scalars().all())


async def update_webhook(
    db: AsyncSession,
    user_id: UUID,
    webhook_id: UUID,
    data: WebhookUpdate,
) -> Webhook:
    """Update a webhook. Verifies ownership."""
    result = await db.execute(
        select(Webhook).where(
            Webhook.id == webhook_id,
            Webhook.user_id == user_id,
        ),
    )
    webhook = result.scalar_one_or_none()
    if webhook is None:
        raise ValueError('Webhook not found')

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
    result = await db.execute(
        select(Webhook).where(
            Webhook.id == webhook_id,
            Webhook.user_id == user_id,
        ),
    )
    webhook = result.scalar_one_or_none()
    if webhook is None:
        raise ValueError('Webhook not found')

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
    # Verify ownership
    wh_result = await db.execute(
        select(Webhook.id).where(
            Webhook.id == webhook_id,
            Webhook.user_id == user_id,
        ),
    )
    if wh_result.scalar_one_or_none() is None:
        raise ValueError('Webhook not found')

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


async def _is_safe_webhook_url(url: str) -> bool:
    """Block webhook URLs targeting internal/private networks."""
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return False
        # Block non-HTTP schemes
        if parsed.scheme not in ('http', 'https'):
            return False
        # Resolve asynchronously to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        resolved = await loop.getaddrinfo(hostname, None, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
        for _, _, _, _, addr in resolved:
            ip = ipaddress.ip_address(addr[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
    except (socket.gaierror, ValueError, OSError) as exc:
        logger.warning('webhook_url_resolution_failed url=%s: %s', url, str(exc)[:100])
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
    """
    last_error: str | None = None
    for attempt in range(max_retries + 1):
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
                logger.warning('Webhook got %d, retry %d/%d in %ds: url=%s', response.status_code, attempt + 1, max_retries, delay, url)
                await asyncio.sleep(delay)
                continue
            logger.info('Webhook delivered: url=%s event=%s status=%d duration=%dms', url, event, response.status_code, duration_ms)
            return response.status_code, duration_ms, None
        except Exception as exc:
            last_error = str(exc)
            if attempt < max_retries:
                delay = 2 ** attempt
                logger.warning('Webhook delivery attempt %d/%d failed, retrying in %ds: url=%s error=%s', attempt + 1, max_retries + 1, delay, url, str(exc)[:100])
                await asyncio.sleep(delay)
            else:
                duration_ms = int((time.monotonic() - start) * 1000)
                logger.error('Webhook delivery failed after %d attempts: url=%s event=%s duration=%dms error=%s', max_retries + 1, url, event, duration_ms, exc)
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
        logger.warning('webhook.blocked_internal_url url=%s', webhook.url)
        return None, 0, 'Webhook URL targets internal network'

    start = time.monotonic()
    return await _deliver_with_retries(
        url=webhook.url,
        event=event,
        body=payload,
        headers=headers,
        start=start,
    )


async def log_delivery(
    db: AsyncSession,
    webhook_id: UUID,
    user_id: UUID,
    event: str,
    url: str,
    status_code: int | None,
    duration_ms: int,
    error: str | None,
) -> WebhookDeliveryLog:
    """Create a delivery log entry."""
    log_entry = WebhookDeliveryLog(
        webhook_id=webhook_id,
        user_id=user_id,
        event=event,
        url=url,
        status_code=status_code,
        duration_ms=duration_ms,
        error=error,
    )
    db.add(log_entry)
    await db.flush()
    await db.refresh(log_entry)
    return log_entry
