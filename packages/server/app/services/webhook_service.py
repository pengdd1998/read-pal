"""Webhook business logic — CRUD, delivery, logging."""

import hashlib
import hmac
import json
import logging
import secrets
import time
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


async def deliver_webhook(
    webhook: Webhook,
    event: str,
    payload: dict,
) -> tuple[int | None, int, str | None]:
    """Deliver a webhook via HTTP POST with HMAC-SHA256 signature.

    Returns (status_code, duration_ms, error).
    """
    body = payload
    body_str = json.dumps(body, separators=(',', ':'), sort_keys=True)
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

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                webhook.url,
                json=body,
                headers=headers,
            )
        duration_ms = int((time.monotonic() - start) * 1000)
        return response.status_code, duration_ms, None
    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        return None, duration_ms, str(exc)


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
