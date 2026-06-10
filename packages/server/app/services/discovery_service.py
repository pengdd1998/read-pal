"""Business logic for book discovery — search, semantic search, free books."""

import asyncio
import logging
from uuid import UUID

from sqlalchemy import String, cast, func, select, distinct
from sqlalchemy.sql.elements import BooleanClauseList
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book

logger = logging.getLogger('read-pal.discovery')


def _escape_like(q: str) -> str:
    """Escape SQL LIKE wildcards in user input."""
    return q.replace('%', r'\%').replace('_', r'\_')


def _tags_search(pattern: str) -> BooleanClauseList:
    """Build a tags search expression that works on both SQLite and PostgreSQL.

    SQLite stores ARRAY as a JSON-like string; PostgreSQL uses native arrays.
    Casting to string and LIKE-ing works for both.
    """
    return func.coalesce(cast(Book.tags, String), '').ilike(pattern)


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


async def search_books(
    db: AsyncSession,
    user_id: UUID,
    q: str,
    page: int,
    limit: int,
) -> tuple[list[dict], int]:
    """Full-text search across the user's books.

    Searches by title, author (case-insensitive), or tags overlap.
    If the query is empty, returns recent books ordered by last_read_at desc.

    Returns (serialized_book_list, total_count).
    """
    if not q.strip():
        total_q = select(func.count()).select_from(Book).where(Book.user_id == user_id)
        data_q = (
            select(Book)
            .where(Book.user_id == user_id)
            .order_by(Book.last_read_at.desc().nullslast(), Book.added_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        total_result, books_result = await asyncio.gather(
            db.execute(total_q), db.execute(data_q),
        )
        total = total_result.scalar_one()
        books = books_result.scalars().all()
    else:
        pattern = f'%{_escape_like(q.strip())}%'
        base_filter = (
            Book.user_id == user_id,
            Book.title.ilike(pattern) | Book.author.ilike(pattern) | _tags_search(pattern),
        )

        total_q = select(func.count()).select_from(Book).where(*base_filter)
        data_q = (
            select(Book)
            .where(*base_filter)
            .order_by(Book.last_read_at.desc().nullslast(), Book.added_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        total_result, books_result = await asyncio.gather(
            db.execute(total_q), db.execute(data_q),
        )
        total = total_result.scalar_one()
        books = books_result.scalars().all()

    return [_book_to_dict(b) for b in books], total


def _build_semantic_filter(user_id: UUID, pattern: str) -> tuple:
    """Build SQLAlchemy filter combining title/author/tags and annotation matches."""
    annotation_book_ids = (
        select(Annotation.book_id)
        .where(
            Annotation.user_id == user_id,
            Annotation.content.ilike(pattern),
        )
    )
    return (
        Book.user_id == user_id,
        (
            Book.title.ilike(pattern)
            | Book.author.ilike(pattern)
            | _tags_search(pattern)
            | Book.id.in_(annotation_book_ids)
        ),
    )


async def _fetch_books_page(
    db: AsyncSession,
    user_id: UUID,
    page: int,
    limit: int,
    base_filter: tuple | None = None,
) -> tuple[list[Book], int]:
    """Fetch a page of books with optional filter; return (books, total)."""
    if base_filter:
        where = base_filter
    else:
        where = (Book.user_id == user_id,)

    total_q = select(func.count()).select_from(Book).where(*where)
    total = (await db.execute(total_q)).scalar_one()

    data_q = (
        select(Book)
        .where(*where)
        .order_by(Book.last_read_at.desc().nullslast(), Book.added_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    books = (await db.execute(data_q)).scalars().all()
    return books, total


async def semantic_search_books(
    db: AsyncSession,
    user_id: UUID,
    q: str,
    page: int,
    limit: int,
) -> tuple[list[dict], int]:
    """Semantic-style search across books and annotations.

    Searches books by title/author and also finds books whose annotations
    match the query content. Results are deduplicated.

    Returns (serialized_book_list, total_count).
    """
    if not q.strip():
        base_filter = None
    else:
        pattern = f'%{_escape_like(q.strip())}%'
        base_filter = _build_semantic_filter(user_id, pattern)

    books, total = await _fetch_books_page(
        db, user_id, page, limit, base_filter,
    )
    return [_book_to_dict(b) for b in books], total


async def get_free_books(db: AsyncSession) -> list[dict]:
    """Return community picks — popular completed books across all users.

    Groups completed books by title, counts readers, and returns the
    top 20 most popular titles (anonymized, no user data).
    Results are cached globally for 5 minutes.
    """
    from app.core.cache import cache_get_or_compute

    cache_key = 'discovery:free_books'

    async def _compute() -> list[dict]:
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
        return [
            {
                'title': row.title,
                'author': row.author,
                'coverUrl': row.cover_url,
                'readerCount': row.reader_count,
            }
            for row in rows
        ]

    return await cache_get_or_compute(cache_key, _compute)
