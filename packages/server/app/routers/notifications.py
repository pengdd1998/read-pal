"""Notification routes — list, mark read, mark all read."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.notification import NotificationUpdate
from app.services import notification_service
from app.utils.i18n import t

router = APIRouter(prefix='/api/v1/notifications', tags=['notifications'])


def _serialize_notification(n: object) -> dict:
    """Convert a Notification ORM object to a response dict."""
    return {
        'id': str(n.id),
        'user_id': str(n.user_id),
        'type': n.type,
        'title': n.title,
        'message': n.message,
        'metadata': n.metadata_,
        'read': n.read,
        'created_at': n.created_at.isoformat() if n.created_at else None,
        'updated_at': n.updated_at.isoformat() if n.updated_at else None,
    }


@router.get('/')
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
            'items': [_serialize_notification(n) for n in notifications],
            'total': total,
            'page': page,
            'per_page': per_page,
        },
    }


@router.patch('/{notification_id}')
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.notification_not_found')},
        )
    return {'success': True, 'data': _serialize_notification(notification)}


@router.patch('/{notification_id}/read')
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.notification_not_found')},
        )
    return {'success': True, 'data': _serialize_notification(notification)}


@router.post('/mark-all-read')
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Mark all unread notifications as read."""
    count = await notification_service.mark_all_read(db, UUID(user['id']))
    return {
        'success': True,
        'data': {'message': f'{count} notifications marked as read'},
    }


@router.get('/unread-count')
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
