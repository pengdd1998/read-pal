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
    BookTagsUpdateRequest,
    BookUpdate,
    SeedSampleBookRequest,
)
from app.schemas.common import GenericResponse
from app.services import book_service
from app.utils.i18n import _get_user_lang, t

router = APIRouter(prefix='/api/v1/books', tags=['books'])


@router.get('', response_model=BookListResponse)
async def list_books(
    status_filter: str | None = Query(None, alias='status'),
    q: str | None = Query(None, description='Search books by title or author'),
    tag: str | None = Query(None, description='Filter by tag'),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookListResponse:
    """List user's books with optional status, search, and tag filters."""
    books, total = await book_service.get_user_books(
        db,
        UUID(current_user['id']),
        status=status_filter,
        search=q,
        tag=tag,
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


@router.get('/{book_id}', response_model=GenericResponse)
async def get_book(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a single book by ID."""
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    book = await book_service.get_book(db, UUID(current_user['id']), book_id)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found', lang)},
        )
    return {'success': True, 'data': BookResponse.model_validate(book).model_dump(by_alias=True, mode='json')}


@router.post('', status_code=status.HTTP_201_CREATED, response_model=GenericResponse)
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


@router.patch('/{book_id}', response_model=GenericResponse)
async def update_book(
    book_id: UUID,
    body: BookUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Partially update a book."""
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    book = await book_service.update_book(db, UUID(current_user['id']), book_id, body)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found', lang)},
        )
    return {'success': True, 'data': BookResponse.model_validate(book).model_dump(by_alias=True, mode='json')}


@router.delete('/{book_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a book and all associated data."""
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    deleted = await book_service.delete_book(db, UUID(current_user['id']), book_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found', lang)},
        )


@router.put('/{book_id}/tags', response_model=GenericResponse)
async def update_tags(
    book_id: UUID,
    body: BookTagsUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Set tags for a book."""
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    tags = body.tags
    book = await book_service.update_tags(db, UUID(current_user['id']), book_id, tags)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found', lang)},
        )
    return {'success': True, 'data': BookResponse.model_validate(book).model_dump(by_alias=True, mode='json')}


@router.post('/seed-sample', status_code=status.HTTP_201_CREATED, response_model=GenericResponse)
async def seed_sample_book(
    body: SeedSampleBookRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a sample book for testing. Idempotent — returns existing if one already exists."""
    title = body.title if body else 'Sample Book'
    author = body.author if body else 'Sample Author'
    uid = UUID(current_user['id'])

    # L2: Check if a sample book already exists for this user
    from sqlalchemy import select as sa_select
    existing = await db.execute(
        sa_select(Book).where(
            Book.user_id == uid,
            Book.title == title,
            Book.author == author,
            Book.tags.contains(['sample']),
        ),
    )
    existing_book = existing.scalar_one_or_none()
    if existing_book:
        return {
            'success': True,
            'data': BookResponse.model_validate(existing_book).model_dump(by_alias=True, mode='json'),
        }

    sample = Book(
        user_id=uid,
        title=title,
        author=author,
        file_type=BookFileType.epub,
        file_size=1024,
        total_pages=1,
        current_page=0,
        status=BookStatus.unread,
        tags=['sample'],
    )
    db.add(sample)
    await db.flush()
    await db.refresh(sample)
    return {
        'success': True,
        'data': BookResponse.model_validate(sample).model_dump(by_alias=True, mode='json'),
    }
