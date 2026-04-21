"""Collection routes — CRUD and book management."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.collection import CollectionCreate, CollectionUpdate
from app.services import collection_service
from app.utils.i18n import t

router = APIRouter(prefix='/api/v1/collections', tags=['collections'])


def _serialize_collection(col: object) -> dict:
    """Convert a Collection ORM object to a response dict."""
    return {
        'id': str(col.id),
        'user_id': str(col.user_id),
        'name': col.name,
        'description': col.description,
        'icon': col.icon,
        'color': col.color,
        'book_ids': [str(bid) for bid in (col.book_ids or [])],
        'created_at': col.created_at.isoformat() if col.created_at else None,
        'updated_at': col.updated_at.isoformat() if col.updated_at else None,
    }


@router.post('', status_code=status.HTTP_201_CREATED)
async def create_collection(
    body: CollectionCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a new collection."""
    col = await collection_service.create_collection(db, UUID(user['id']), body)
    return {'success': True, 'data': _serialize_collection(col)}


@router.get('')
async def list_collections(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List all collections for the authenticated user."""
    cols = await collection_service.list_collections(db, UUID(user['id']))
    return {
        'success': True,
        'data': {'items': [_serialize_collection(c) for c in cols]},
    }


@router.get('/{collection_id}')
async def get_collection(
    collection_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Get a collection by ID."""
    col = await collection_service.get_collection(db, UUID(user['id']), collection_id)
    if col is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.collection_not_found')},
        )
    return {'success': True, 'data': _serialize_collection(col)}


@router.patch('/{collection_id}')
async def update_collection(
    collection_id: UUID,
    body: CollectionUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Update a collection."""
    try:
        col = await collection_service.update_collection(
            db, UUID(user['id']), collection_id, body,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc
    return {'success': True, 'data': _serialize_collection(col)}


@router.delete('/{collection_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> None:
    """Delete a collection."""
    try:
        await collection_service.delete_collection(db, UUID(user['id']), collection_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc


@router.get('/{collection_id}/books')
async def get_collection_books(
    collection_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List books in a collection."""
    col = await collection_service.get_collection(db, UUID(user['id']), collection_id)
    if col is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.collection_not_found')},
        )
    return {
        'success': True,
        'data': {
            'book_ids': [str(bid) for bid in (col.book_ids or [])],
        },
    }


@router.post('/{collection_id}/books')
async def add_books_batch(
    collection_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Add multiple books to a collection.

    Body: ``{"bookIds": ["uuid1", "uuid2"]}``
    """
    book_ids = body.get('bookIds', [])
    col = None
    for bid_str in book_ids:
        try:
            col = await collection_service.add_book_to_collection(
                db, UUID(user['id']), collection_id, UUID(bid_str),
            )
        except ValueError:
            continue
    if col is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.collection_not_found')},
        )
    return {'success': True, 'data': _serialize_collection(col)}


@router.post('/{collection_id}/books/remove')
async def remove_books_batch(
    collection_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Remove multiple books from a collection.

    Body: ``{"bookIds": ["uuid1", "uuid2"]}``
    """
    book_ids = body.get('bookIds', [])
    col = None
    for bid_str in book_ids:
        try:
            col = await collection_service.remove_book_from_collection(
                db, UUID(user['id']), collection_id, UUID(bid_str),
            )
        except ValueError:
            continue
    if col is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.collection_not_found')},
        )
    return {'success': True, 'data': _serialize_collection(col)}


@router.post('/{collection_id}/books/{book_id}')
async def add_book(
    collection_id: UUID,
    book_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Add a book to a collection."""
    try:
        col = await collection_service.add_book_to_collection(
            db, UUID(user['id']), collection_id, book_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc
    return {'success': True, 'data': _serialize_collection(col)}


@router.delete('/{collection_id}/books/{book_id}')
async def remove_book(
    collection_id: UUID,
    book_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Remove a book from a collection."""
    try:
        col = await collection_service.remove_book_from_collection(
            db, UUID(user['id']), collection_id, book_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc
    return {'success': True, 'data': _serialize_collection(col)}
