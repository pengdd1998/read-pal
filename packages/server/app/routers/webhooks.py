"""Webhook routes — CRUD and delivery logs."""


import logging
import time
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import write_limiter
from app.schemas.common import GenericResponse, paginate
from app.schemas.webhook import (
    DeliveryLogResponse,
    WebhookCreate,
    WebhookListItemResponse,
    WebhookResponse,
    WebhookTestResponse,
    WebhookUpdate,
)
from app.services import webhook_service
from app.utils.i18n import not_found_error, translate_error
from app.middleware.rate_limiter import api_limiter
from app.middleware.exception_handlers import NotFoundError

logger = logging.getLogger('read-pal.webhooks')

router = APIRouter(prefix='/api/v1/webhooks', tags=['webhooks'], dependencies=[api_limiter])


@router.get('/events', response_model=GenericResponse)
async def list_webhook_events(
    user: dict = Depends(get_current_user),
) -> dict:
    """List available webhook event types."""
    events = [
        'book.created',
        'book.updated',
        'book.deleted',
        'book.completed',
        'annotation.created',
        'annotation.updated',
        'annotation.deleted',
        'session.started',
        'session.ended',
        'flashcard.created',
        'flashcard.reviewed',
        'memory_book.generated',
        'reading_book.shared',
    ]
    return {'success': True, 'data': events}


@router.post('/{webhook_id}/test', response_model=GenericResponse, dependencies=[write_limiter])
async def test_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Test a webhook by sending a test payload."""
    try:
        wh = await webhook_service.get_webhook(db, UUID(user['id']), webhook_id)
    except NotFoundError as exc:
        logger.debug('validation error in webhooks')
        raise not_found_error(translate_error(exc)) from exc
    # Actually deliver the test webhook
    test_result = await webhook_service.deliver_webhook(
        webhook=wh,
        event='webhook.test',
        payload={'test': True, 'webhook_id': str(wh.id), 'timestamp': time.time()},
    )
    data = WebhookTestResponse(
        id=wh.id,
        url=wh.url,
        test_result='delivered' if test_result[0] is not None else 'failed',
    ).model_dump(by_alias=True, mode='json')
    return {'success': True, 'data': data}


@router.post('', status_code=status.HTTP_201_CREATED, response_model=GenericResponse, dependencies=[write_limiter])
async def create_webhook(
    body: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a new webhook."""
    webhook = await webhook_service.create_webhook(db, UUID(user['id']), body)
    data = WebhookResponse.model_validate(webhook).model_dump(by_alias=True, mode='json')
    return {'success': True, 'data': data}


@router.get('', response_model=GenericResponse)
async def list_webhooks(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List all webhooks for the authenticated user."""
    webhooks = await webhook_service.list_webhooks(db, UUID(user['id']))
    items = [
        WebhookListItemResponse.model_validate(w).model_dump(by_alias=True, mode='json')
        for w in webhooks
    ]
    return {'success': True, 'data': {'items': items}}


@router.patch('/{webhook_id}', response_model=GenericResponse, dependencies=[write_limiter])
async def update_webhook(
    webhook_id: UUID,
    body: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Update a webhook."""
    try:
        webhook = await webhook_service.update_webhook(
            db, UUID(user['id']), webhook_id, body,
        )
    except NotFoundError as exc:
        logger.debug('validation error in webhooks')
        raise not_found_error(translate_error(exc)) from exc
    data = WebhookResponse.model_validate(webhook).model_dump(by_alias=True, mode='json')
    return {'success': True, 'data': data}


@router.delete('/{webhook_id}', status_code=status.HTTP_204_NO_CONTENT, dependencies=[write_limiter])
async def delete_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> None:
    """Delete a webhook."""
    try:
        await webhook_service.delete_webhook(db, UUID(user['id']), webhook_id)
    except NotFoundError as exc:
        logger.debug('validation error in webhooks')
        raise not_found_error(translate_error(exc)) from exc


@router.get('/{webhook_id}/deliveries', response_model=GenericResponse)
async def get_delivery_logs(
    webhook_id: UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Get delivery logs for a webhook."""
    try:
        logs, total = await webhook_service.get_delivery_logs(
            db, UUID(user['id']), webhook_id, page, per_page,
        )
    except NotFoundError as exc:
        logger.debug('validation error in webhooks')
        raise not_found_error(translate_error(exc)) from exc
    items = [
        DeliveryLogResponse.model_validate(log).model_dump(by_alias=True, mode='json')
        for log in logs
    ]
    return {'success': True, 'data': paginate(items, total, page, per_page)}
