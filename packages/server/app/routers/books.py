"""Book CRUD routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.book import Book, BookFileType, BookStatus
from app.schemas.book import (
    BookCreate,
    BookListResponse,
    BookResponse,
    BookStatsResponse,
    BookUpdate,
)
from app.services import book_service
from app.utils.i18n import _get_user_lang, t

router = APIRouter(prefix='/api/v1/books', tags=['books'])


@router.get('', response_model=BookListResponse)
async def list_books(
    status_filter: str | None = Query(None, alias='status'),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookListResponse:
    """List user's books with optional status filter and pagination."""
    books, total = await book_service.get_user_books(
        db,
        UUID(current_user['id']),
        status=status_filter,
        page=page,
        per_page=per_page,
    )
    return BookListResponse(
        data=[BookResponse.model_validate(b) for b in books],
        total=total,
    )


@router.get('/stats', response_model=BookStatsResponse)
async def get_stats(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookStatsResponse:
    """Return aggregate book statistics for the current user."""
    stats = await book_service.get_book_stats(db, UUID(current_user['id']))
    return BookStatsResponse(data=stats)


@router.get('/{book_id}')
async def get_book(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a single book by ID."""
    lang = await _get_user_lang(db, UUID(current_user['id']))
    book = await book_service.get_book(db, UUID(current_user['id']), book_id)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found', lang)},
        )
    return {'success': True, 'data': BookResponse.model_validate(book).model_dump(by_alias=True, mode='json')}


@router.post('', status_code=status.HTTP_201_CREATED)
async def create_book(
    body: BookCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new book."""
    book = await book_service.create_book(db, UUID(current_user['id']), body)
    return {
        'success': True,
        'data': BookResponse.model_validate(book).model_dump(by_alias=True, mode='json'),
    }


@router.patch('/{book_id}')
async def update_book(
    book_id: UUID,
    body: BookUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Partially update a book."""
    lang = await _get_user_lang(db, UUID(current_user['id']))
    book = await book_service.update_book(db, UUID(current_user['id']), book_id, body)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found', lang)},
        )
    return {'success': True, 'data': BookResponse.model_validate(book).model_dump(by_alias=True, mode='json')}


@router.delete('/{book_id}')
async def delete_book(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a book and all associated data."""
    lang = await _get_user_lang(db, UUID(current_user['id']))
    deleted = await book_service.delete_book(db, UUID(current_user['id']), book_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found', lang)},
        )
    return {'success': True, 'data': {'message': t('errors.book_deleted', lang)}}


@router.put('/{book_id}/tags')
async def update_tags(
    book_id: UUID,
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Set tags for a book.

    Body: ``{"tags": ["fiction", "sci-fi"]}``
    """
    lang = await _get_user_lang(db, UUID(current_user['id']))
    tags = body.get('tags', [])
    if not isinstance(tags, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'INVALID_INPUT', 'message': t('errors.tags_must_be_list', lang)},
        )
    book = await book_service.update_tags(db, UUID(current_user['id']), book_id, tags)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found', lang)},
        )
    return {'success': True, 'data': BookResponse.model_validate(book).model_dump(by_alias=True, mode='json')}


@router.post('/seed-sample', status_code=status.HTTP_201_CREATED)
async def seed_sample_book(
    body: dict | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a sample book for testing.

    Body (optional): ``{"title": "...", "author": "..."}``
    """
    title = (body or {}).get('title', 'Sample Book')
    author = (body or {}).get('author', 'Sample Author')

    sample = Book(
        user_id=UUID(current_user['id']),
        title=title,
        author=author,
        file_type=BookFileType.epub,
        file_size=1024,
        total_pages=100,
        current_page=0,
        status=BookStatus.unread,
        tags=['sample'],
    )
    db.add(sample)
    await db.flush()
    return {
        'success': True,
        'data': BookResponse.model_validate(sample).model_dump(by_alias=True, mode='json'),
    }
