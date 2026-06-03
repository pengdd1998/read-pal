"""Business logic for book discovery — search, semantic search, free books."""

import json
import logging
from uuid import UUID

from sqlalchemy import String, cast, func, select, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.annotation import Annotation
from app.models.book import Book

logger = logging.getLogger('read-pal.discovery')


def _escape_like(q: str) -> str:
    """Escape SQL LIKE wildcards in user input."""
    return q.replace('%', r'\%').replace('_', r'\_')


def _tags_search(pattern: str):
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
        pattern = f'%{_escape_like(q.strip())}%'
        base_filter = (
            Book.user_id == user_id,
            Book.title.ilike(pattern) | Book.author.ilike(pattern) | _tags_search(pattern),
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

    return [_book_to_dict(b) for b in books], total


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
        pattern = f'%{_escape_like(q.strip())}%'

        # Book IDs matched via their annotations' content
        annotation_book_ids = (
            select(Annotation.book_id)
            .where(
                Annotation.user_id == user_id,
                Annotation.content.ilike(pattern),
            )
        )

        # Combined filter: title/author/tags match OR book ID in annotation matches
        base_filter = (
            Book.user_id == user_id,
            (
                Book.title.ilike(pattern)
                | Book.author.ilike(pattern)
                | _tags_search(pattern)
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

    return [_book_to_dict(b) for b in books], total


async def get_free_books(db: AsyncSession) -> list[dict]:
    """Return community picks — popular completed books across all users.

    Groups completed books by title, counts readers, and returns the
    top 20 most popular titles (anonymized, no user data).
    Results are cached globally for 5 minutes.
    """
    cache_key = 'discovery:free_books'
    try:
        redis = get_redis()
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        logger.warning('Redis unavailable, skipping free-books cache')
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

    result = [
        {
            'title': row.title,
            'author': row.author,
            'coverUrl': row.cover_url,
            'readerCount': row.reader_count,
        }
        for row in rows
    ]

    try:
        redis = get_redis()
        await redis.setex(cache_key, 300, json.dumps(result))
    except Exception:
        logger.warning('Redis unavailable, skipping free-books cache set')

    return result
