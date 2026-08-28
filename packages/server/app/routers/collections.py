"""Collection routes — CRUD and book management."""



import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import api_limiter, write_limiter
from app.schemas.collection import (
    CollectionBooksBatchRequest,
    CollectionCreate,
    CollectionListResponse,
    CollectionResponse,
    CollectionUpdate,
)
from app.schemas.common import GenericResponse
from app.services import collection_service
from app.utils.i18n import _get_user_lang, not_found_error, t, translate_error
from app.utils.sanitizer import sanitize_string_fields

logger = logging.getLogger('read-pal.collections')

router = APIRouter(
    prefix='/api/v1/collections',
    tags=['collections'],
    dependencies=[api_limiter],
)


def _dump(col: object) -> dict:
    """Serialize a Collection ORM object via Pydantic schema."""
    return CollectionResponse.model_validate(col).model_dump(
        by_alias=True, mode='json',
    )


@router.post('', status_code=status.HTTP_201_CREATED, response_model=GenericResponse, dependencies=[write_limiter])
async def create_collection(
    body: CollectionCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a new collection."""
    # XSS prevention: strip HTML from user-supplied text fields.
    body_dict = body.model_dump()
    sanitize_string_fields(body_dict, ['name', 'description', 'icon', 'color'])
    body = CollectionCreate(**body_dict)
    col = await collection_service.create_collection(db, UUID(user['id']), body)
    return {'success': True, 'data': _dump(col)}


@router.get('', response_model=CollectionListResponse)
async def list_collections(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> CollectionListResponse:
    """List collections for the authenticated user, paginated."""
    cols, total = await collection_service.list_collections(
        db, UUID(user['id']), page, per_page,
    )
    return CollectionListResponse(
        data=[CollectionResponse.model_validate(c) for c in cols],
        total=total,
        page=page,
        per_page=per_page,
        has_more=(page * per_page) < total,
    )


@router.get('/{collection_id}', response_model=GenericResponse)
async def get_collection(
    collection_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Get a collection by ID."""
    col = await collection_service.get_collection(db, UUID(user['id']), collection_id)
    if col is None:
        raise not_found_error(t('errors.collection_not_found'))
    return {'success': True, 'data': _dump(col)}


@router.patch('/{collection_id}', response_model=GenericResponse, dependencies=[write_limiter])
async def update_collection(
    collection_id: UUID,
    body: CollectionUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Update a collection."""
    lang = await _get_user_lang(db, UUID(user['id']))
    # XSS prevention: strip HTML from user-supplied text fields (mirror create_collection).
    body_dict = body.model_dump(exclude_unset=True)
    sanitize_string_fields(body_dict, ['name', 'description', 'icon', 'color'])
    body = CollectionUpdate(**body_dict)
    try:
        col = await collection_service.update_collection(
            db, UUID(user['id']), collection_id, body,
        )
    except ValueError as exc:
        logger.debug('validation error in collections')
        raise not_found_error(translate_error(exc, lang)) from exc
    return {'success': True, 'data': _dump(col)}


@router.delete('/{collection_id}', status_code=status.HTTP_204_NO_CONTENT, dependencies=[write_limiter])
async def delete_collection(
    collection_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> None:
    """Delete a collection."""
    lang = await _get_user_lang(db, UUID(user['id']))
    try:
        await collection_service.delete_collection(db, UUID(user['id']), collection_id)
    except ValueError as exc:
        logger.debug('validation error in collections')
        raise not_found_error(translate_error(exc, lang)) from exc


@router.get('/{collection_id}/books', response_model=GenericResponse)
async def get_collection_books(
    collection_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List books in a collection."""
    col = await collection_service.get_collection(db, UUID(user['id']), collection_id)
    if col is None:
        raise not_found_error(t('errors.collection_not_found'))
    return {
        'success': True,
        'data': {
            'bookIds': [str(bid) for bid in (col.book_ids or [])],
        },
    }


@router.post('/{collection_id}/books', response_model=GenericResponse, dependencies=[write_limiter])
async def add_books_batch(
    collection_id: UUID,
    body: CollectionBooksBatchRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Add multiple books to a collection (batch — single DB round-trip)."""
    parsed_ids = [UUID(bid_str) for bid_str in body.book_ids]
    try:
        col = await collection_service.add_books_batch(
            db, UUID(user['id']), collection_id, parsed_ids,
        )
    except ValueError:
        logger.debug('validation error in collections')
        raise not_found_error(t('errors.collection_not_found'))
    return {'success': True, 'data': _dump(col)}


@router.post('/{collection_id}/books/remove', response_model=GenericResponse, dependencies=[write_limiter])
async def remove_books_batch(
    collection_id: UUID,
    body: CollectionBooksBatchRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Remove multiple books from a collection (batch — single DB round-trip)."""
    parsed_ids = [UUID(bid_str) for bid_str in body.book_ids]
    try:
        col = await collection_service.remove_books_batch(
            db, UUID(user['id']), collection_id, parsed_ids,
        )
    except ValueError:
        logger.debug('validation error in collections')
        raise not_found_error(t('errors.collection_not_found'))
    return {'success': True, 'data': _dump(col)}


@router.post('/{collection_id}/books/{book_id}', response_model=GenericResponse, dependencies=[write_limiter])
async def add_book(
    collection_id: UUID,
    book_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Add a book to a collection."""
    lang = await _get_user_lang(db, UUID(user['id']))
    try:
        col = await collection_service.add_book_to_collection(
            db, UUID(user['id']), collection_id, book_id,
        )
    except ValueError as exc:
        logger.debug('validation error in collections')
        raise not_found_error(translate_error(exc, lang)) from exc
    return {'success': True, 'data': _dump(col)}


@router.delete('/{collection_id}/books/{book_id}', status_code=status.HTTP_204_NO_CONTENT, dependencies=[write_limiter])
async def remove_book(
    collection_id: UUID,
    book_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> None:
    """Remove a book from a collection."""
    lang = await _get_user_lang(db, UUID(user['id']))
    try:
        await collection_service.remove_book_from_collection(
            db, UUID(user['id']), collection_id, book_id,
        )
    except ValueError as exc:
        logger.debug('validation error in collections')
        raise not_found_error(translate_error(exc, lang)) from exc
