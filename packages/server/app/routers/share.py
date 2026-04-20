"""Shared export routes — create, retrieve, list, delete."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.share import ShareCreate
from app.services import share_service
from app.utils.i18n import t

router = APIRouter(prefix='/api/v1/share', tags=['share'])


def _serialize_share(share: object, include_url: bool = False) -> dict:
    """Convert a SharedExport ORM object to a response dict."""
    data = {
        'id': str(share.id),
        'user_id': str(share.user_id),
        'book_id': str(share.book_id),
        'token': share.token,
        'format': share.format,
        'title': share.title,
        'content_type': share.content_type,
        'view_count': share.view_count,
        'expires_at': share.expires_at.isoformat() if share.expires_at else None,
        'created_at': share.created_at.isoformat() if share.created_at else None,
        'updated_at': share.updated_at.isoformat() if share.updated_at else None,
    }
    if include_url:
        data['share_url'] = f'/api/v1/share/s/{share.token}'
    return data


@router.post('/', status_code=status.HTTP_201_CREATED)
async def create_share(
    body: ShareCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a new shared export."""
    share = await share_service.create_share(db, UUID(user['id']), body)
    return {'success': True, 'data': _serialize_share(share, include_url=True)}


@router.get('/')
async def list_shares(
    book_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List shares for the authenticated user."""
    shares = await share_service.list_shares(db, UUID(user['id']), book_id)
    return {
        'success': True,
        'data': {
            'items': [_serialize_share(s, include_url=True) for s in shares],
        },
    }


@router.get('/s/{token}')
async def get_shared_content(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get shared content by token. No auth required."""
    share = await share_service.get_share(db, token)
    if share is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.share_not_found')},
        )
    return {
        'success': True,
        'data': {
            'title': share.title,
            'format': share.format,
            'content_type': share.content_type,
            'content': share.content,
            'view_count': share.view_count,
        },
    }


@router.delete('/{share_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_share(
    share_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> None:
    """Delete a shared export."""
    try:
        await share_service.delete_share(db, UUID(user['id']), share_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc


@router.post('/export', status_code=status.HTTP_201_CREATED)
async def export_share(
    body: ShareCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Share an export — alias for POST /."""
    share = await share_service.create_share(db, UUID(user['id']), body)
    return {'success': True, 'data': _serialize_share(share, include_url=True)}


@router.get('/reading-card')
async def get_reading_card(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Get reading card data for the user."""
    shares = await share_service.list_shares(db, UUID(user['id']))
    return {
        'success': True,
        'data': {
            'total_shares': len(shares),
            'shares': [_serialize_share(s) for s in shares[:10]],
        },
    }
