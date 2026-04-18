"""Discovery routes — search, semantic search, free books."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.annotation import Annotation
from app.models.book import Book

router = APIRouter(prefix='/api/v1/discovery', tags=['discovery'])


def _book_to_dict(book: Book) -> dict:
    """Serialize a Book ORM instance to a response dict."""
    return {
        'id': str(book.id),
        'title': book.title,
        'author': book.author,
        'coverUrl': book.cover_url,
        'fileType': book.file_type,
        'totalPages': book.total_pages,
        'currentPage': book.current_page,
        'progress': float(book.progress),
        'status': book.status,
        'tags': book.tags or [],
    }


@router.get('/search')
async def search(
    q: str = Query('', max_length=200),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Full-text search across the user's books.

    Searches by title, author (case-insensitive), or tags overlap.
    If the query is empty, returns recent books ordered by last_read_at desc.
    """
    user_id = UUID(current_user['id'])

    if not q.strip():
        # Return recent books
        total_q = select(func.count()).select_from(Book).where(Book.user_id == user_id)
        total = (await db.execute(total_q)).scalar_one()

        data_q = (
            select(Book)
            .where(Book.user_id == user_id)
            .order_by(Book.last_read_at.desc().nullslast(), Book.added_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        books = (await db.execute(data_q)).scalars().all()
    else:
        pattern = f'%{q.strip()}%'
        base_filter = (
            Book.user_id == user_id,
            Book.title.ilike(pattern) | Book.author.ilike(pattern),
        )

        total_q = select(func.count()).select_from(Book).where(*base_filter)
        total = (await db.execute(total_q)).scalar_one()

        data_q = (
            select(Book)
            .where(*base_filter)
            .order_by(Book.last_read_at.desc().nullslast(), Book.added_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        books = (await db.execute(data_q)).scalars().all()

    return {
        'success': True,
        'data': {
            'items': [_book_to_dict(b) for b in books],
            'total': total,
            'query': q,
            'page': page,
            'limit': limit,
        },
    }


@router.get('/semantic')
async def semantic_search(
    q: str = Query('', max_length=200),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Semantic-style search across books and annotations.

    Searches books by title/author and also finds books whose annotations
    match the query content. Results are deduplicated.
    """
    user_id = UUID(current_user['id'])

    if not q.strip():
        # Fallback to recent books (same as search)
        total_q = select(func.count()).select_from(Book).where(Book.user_id == user_id)
        total = (await db.execute(total_q)).scalar_one()

        data_q = (
            select(Book)
            .where(Book.user_id == user_id)
            .order_by(Book.last_read_at.desc().nullslast(), Book.added_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        books = (await db.execute(data_q)).scalars().all()
    else:
        pattern = f'%{q.strip()}%'

        # Book IDs matched via their annotations' content
        annotation_book_ids = (
            select(Annotation.book_id)
            .where(
                Annotation.user_id == user_id,
                Annotation.content.ilike(pattern),
            )
        )

        # Combined filter: title/author match OR book ID in annotation matches
        base_filter = (
            Book.user_id == user_id,
            (
                Book.title.ilike(pattern)
                | Book.author.ilike(pattern)
                | Book.id.in_(annotation_book_ids)
            ),
        )

        total_q = select(func.count()).select_from(Book).where(*base_filter)
        total = (await db.execute(total_q)).scalar_one()

        data_q = (
            select(Book)
            .where(*base_filter)
            .order_by(Book.last_read_at.desc().nullslast(), Book.added_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        books = (await db.execute(data_q)).scalars().all()

    return {
        'success': True,
        'data': {
            'items': [_book_to_dict(b) for b in books],
            'total': total,
            'query': q,
            'page': page,
            'limit': limit,
        },
    }


@router.get('/free-books')
async def get_free_books(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return community picks — popular completed books across all users.

    Groups completed books by title, counts readers, and returns the
    top 20 most popular titles (anonymized, no user data).
    """
    q = (
        select(
            Book.title,
            Book.author,
            func.max(Book.cover_url).label('cover_url'),
            func.count(distinct(Book.user_id)).label('reader_count'),
        )
        .where(Book.status == 'completed')
        .group_by(Book.title, Book.author)
        .order_by(func.count(distinct(Book.user_id)).desc())
        .limit(20)
    )
    rows = (await db.execute(q)).all()

    items = [
        {
            'title': row.title,
            'author': row.author,
            'coverUrl': row.cover_url,
            'readerCount': row.reader_count,
        }
        for row in rows
    ]

    return {
        'success': True,
        'data': {
            'items': items,
            'total': len(items),
        },
    }
