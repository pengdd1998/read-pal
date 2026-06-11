"""Notification routes — list, mark read, mark all read."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import api_limiter
from app.schemas.common import GenericResponse
from app.schemas.notification import NotificationResponse, NotificationUpdate
from app.services import notification_service
from app.utils.i18n import not_found_error, t

router = APIRouter(
    prefix='/api/v1/notifications',
    tags=['notifications'],
    dependencies=[api_limiter],
)


def _dump(n: object) -> dict:
    """Serialize a Notification ORM object via Pydantic schema."""
    return NotificationResponse.model_validate(n).model_dump(
        by_alias=True, mode='json',
    )


@router.get('', response_model=GenericResponse)
async def list_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List notifications for the authenticated user."""
    notifications, total = await notification_service.list_notifications(
        db, UUID(user['id']), unread_only, page, per_page,
    )
    return {
        'success': True,
        'data': {
            'items': [_dump(n) for n in notifications],
            'total': total,
            'page': page,
            'perPage': per_page,
        },
    }


@router.patch('/{notification_id}', response_model=GenericResponse)
async def mark_notification_read(
    notification_id: UUID,
    body: NotificationUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Mark a notification as read or unread."""
    notification = await notification_service.mark_read(
        db, UUID(user['id']), notification_id,
    )
    if notification is None:
        raise not_found_error(t('errors.notification_not_found'))
    return {'success': True, 'data': _dump(notification)}


@router.patch('/{notification_id}/read', response_model=GenericResponse)
async def mark_read_alias(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Mark a notification as read (frontend compatibility alias)."""
    notification = await notification_service.mark_read(
        db, UUID(user['id']), notification_id,
    )
    if notification is None:
        raise not_found_error(t('errors.notification_not_found'))
    return {'success': True, 'data': _dump(notification)}


@router.post('/mark-all-read', response_model=GenericResponse)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Mark all unread notifications as read."""
    count = await notification_service.mark_all_read(db, UUID(user['id']))
    return {
        'success': True,
        'data': {'message': t('errors.notifications_marked_read', count=count)},
    }


@router.get('/unread-count', response_model=GenericResponse)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Get unread notification count."""
    count = await notification_service.unread_count(db, UUID(user['id']))
    return {
        'success': True,
        'data': count,
    }
