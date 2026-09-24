"""Shared book_contents store — content-addressed parse payload.

Split from upload_service.py (400-line services cap). The immutable
chapters/metadata of a parsed upload live once per distinct file bytes;
see docs/design/cross-user-content-sharing.md (r2).
"""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book_content import BookContent
from app.models.document import Document
from app.services.text_helpers import (
    text_to_html_paragraphs as _text_to_html_paragraphs,
)
from app.core.cache import cache_delete, cache_get, cache_set
from app.utils.db_guard import db_error_guard
from app.utils.i18n import t


async def upsert_book_content(
    db: AsyncSession,
    *,
    content_hash: str,
    file_size: int,
    file_type: str,
    title: str,
    author: str,
    raw_chapters: list | None,
    total_pages: int,
    meta: dict | None,
    cover_url: str | None,
    created_by: UUID,
) -> None:
    """Idempotently record the shared, content-addressed parse payload.

    INSERT ... ON CONFLICT DO NOTHING: the first uploader's parse is the
    canonical copy; identical later uploads do not touch it (r2: content
    is kept long-term — no update, no expiry).
    """

    async with db_error_guard('upload_service.upsert_book_content'):
        stmt = pg_insert(BookContent).values(
            content_hash=content_hash,
            file_size=file_size,
            file_type=file_type,
            title=title,
            author=author,
            raw_chapters=raw_chapters,
            total_pages=total_pages or 0,
            metadata_=meta or None,
            cover_object_key=cover_url,
            created_by=created_by,
        )
        stmt = stmt.on_conflict_do_nothing(index_elements=['content_hash'])
        await db.execute(stmt)


async def _get_cached_chapters(book_id: UUID) -> list[dict] | None:
    """Return the cached assembled chapters for a book, if any.

    Chapter content is immutable after upload (the Document row is written
    once), so the assembled chapters array is safe to cache long. Cache
    helpers are best-effort: any Redis failure is a miss (P-style — the
    cache must never turn into an outage).
    """
    return await cache_get(f'book-content:{book_id}')


async def _put_cached_chapters(book_id: UUID, chapters: list[dict]) -> None:
    if not chapters:
        return
    await cache_set(f'book-content:{book_id}', chapters, ttl=7 * 24 * 3600)


async def invalidate_cached_chapters(book_id: UUID) -> None:
    """Drop the cached chapter payload (call on book delete)."""
    await cache_delete(f'book-content:{book_id}')


async def _get_shared_content(db: AsyncSession, content_hash: str) -> BookContent | None:
    """Fetch the shared book_contents row for a hash (read path, step 2)."""
    async with db_error_guard('upload_service.get_shared_content'):
        result = await db.execute(
            select(BookContent).where(BookContent.content_hash == content_hash),
        )
        return result.scalar_one_or_none()


def _chapters_from_shared(shared: BookContent) -> list[dict]:
    """Chapters from a shared row.

    0033 dropped the slim ``chapters`` column — every row that ever had it
    also carried ``raw_chapters`` (they were written together), and nothing
    read the slim copy while raw existed. Rows with no raw payload (never
    observed, defensive) yield an empty list; the legacy Document fallback
    in get_book_content covers those books.
    """
    raw = shared.raw_chapters or []
    return [
        {**ch, 'rawContent': ch.get('rawContent') or ch.get('content', '')}
        for ch in raw if isinstance(ch, dict)
    ]


def _build_chapters(doc: Document | None, lang: str) -> list[dict]:
    """Build chapters array from a Document."""
    if not doc or not hasattr(doc, 'chapters') or not doc.chapters:
        return []
    chapters = []
    for i, ch in enumerate(doc.chapters):
        if isinstance(ch, dict):
            raw = ch.get('rawContent', '')
            content = ch.get('content', '')
            if not raw and content:
                # Use content directly if it's already HTML, otherwise wrap in <p>
                if '<' in content and '>' in content:
                    raw = content
                else:
                    raw = _text_to_html_paragraphs(content)
            elif not raw:
                raw = ''
            chapters.append({
                'id': ch.get('id', str(i)),
                'title': ch.get('title', t('errors.chapter_title', lang, index=i + 1)),
                'content': content,
                'rawContent': raw,
            })
    return chapters
