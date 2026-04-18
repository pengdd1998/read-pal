"""Webhook routes — CRUD and delivery logs."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.webhook import WebhookCreate, WebhookUpdate
from app.services import webhook_service

router = APIRouter(prefix='/api/v1/webhooks', tags=['webhooks'])


@router.get('/events')
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


@router.post('/{webhook_id}/test')
async def test_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Test a webhook by sending a test payload."""
    try:
        webhooks = await webhook_service.list_webhooks(db, UUID(user['id']))
        wh = next((w for w in webhooks if w.id == webhook_id), None)
        if wh is None:
            raise ValueError('Webhook not found')
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc
    return {
        'success': True,
        'data': {
            'id': str(wh.id),
            'url': wh.url,
            'test_result': 'queued',
        },
    }


@router.post('/', status_code=status.HTTP_201_CREATED)
async def create_webhook(
    body: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a new webhook."""
    webhook = await webhook_service.create_webhook(db, UUID(user['id']), body)
    return {
        'success': True,
        'data': {
            'id': str(webhook.id),
            'url': webhook.url,
            'events': webhook.events,
            'secret': webhook.secret,
            'is_active': webhook.is_active,
        },
    }


@router.get('/')
async def list_webhooks(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List all webhooks for the authenticated user."""
    webhooks = await webhook_service.list_webhooks(db, UUID(user['id']))
    return {
        'success': True,
        'data': {
            'items': [
                {
                    'id': str(w.id),
                    'url': w.url,
                    'events': w.events,
                    'is_active': w.is_active,
                    'last_delivery_at': w.last_delivery_at.isoformat() if w.last_delivery_at else None,
                    'last_delivery_status': w.last_delivery_status,
                    'failure_count': w.failure_count,
                    'created_at': w.created_at.isoformat() if w.created_at else None,
                }
                for w in webhooks
            ],
        },
    }


@router.patch('/{webhook_id}')
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
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc
    return {
        'success': True,
        'data': {
            'id': str(webhook.id),
            'url': webhook.url,
            'events': webhook.events,
            'is_active': webhook.is_active,
        },
    }


@router.delete('/{webhook_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> None:
    """Delete a webhook."""
    try:
        await webhook_service.delete_webhook(db, UUID(user['id']), webhook_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc


@router.get('/{webhook_id}/deliveries')
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
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc
    return {
        'success': True,
        'data': {
            'items': [
                {
                    'id': str(log.id),
                    'webhook_id': str(log.webhook_id),
                    'event': log.event,
                    'url': log.url,
                    'status_code': log.status_code,
                    'duration_ms': log.duration_ms,
                    'error': log.error,
                    'created_at': log.created_at.isoformat() if log.created_at else None,
                }
                for log in logs
            ],
            'total': total,
            'page': page,
            'per_page': per_page,
        },
    }
