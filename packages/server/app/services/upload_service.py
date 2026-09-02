"""File upload and content processing service."""

import asyncio
import base64
import logging
import re
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookFileType
from app.models.document import Document
from app.services.epub_parser import process_epub
from app.services.object_storage import upload_cover
from app.services.pdf_parser import process_pdf
from app.services.upload_content_store import (
    _build_chapters,  # noqa: F401 — re-exported (Document chapter shaping)
    _chapters_from_shared,
    _get_cached_chapters,
    _get_shared_content,
    _put_cached_chapters,
    invalidate_cached_chapters,  # noqa: F401 — re-exported (book_service)
    upsert_book_content,
)
from app.services.upload_stream import (  # noqa: F401 — re-exported API
    find_existing_book_by_hash,
    get_file_type,
    stream_upload_to_tempfile,
)
from app.utils.db import db_error_guard
from app.utils.i18n import t, DEFAULT_LANGUAGE
from app.utils.sanitizer import sanitize_book_field

logger = logging.getLogger('read-pal')

ALLOWED_EXTENSIONS = {'.epub'}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


# ---------------------------------------------------------------------------
# File validation
# ---------------------------------------------------------------------------

def validate_file(filename: str, file_size: int, lang: str = DEFAULT_LANGUAGE) -> str | None:
    """Validate file before processing. Returns error message or None."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return t('errors.invalid_file_type_ext', lang, ext=ext, allowed=', '.join(sorted(ALLOWED_EXTENSIONS)))
    if file_size > MAX_FILE_SIZE:
        return t('errors.file_too_large_mb', lang, max_size=MAX_FILE_SIZE // (1024 * 1024))
    return None


# ---------------------------------------------------------------------------
# Tempfile streaming
# ---------------------------------------------------------------------------


async def _parse_file_content(file_type: str, file_path: str) -> dict:
    """Parse an uploaded file and return the extraction result."""
    if file_type == 'pdf':
        return await process_pdf(file_path)
    return await process_epub(file_path)


def _resolve_metadata(
    result: dict,
    original_filename: str | None,
    title: str | None,
    author: str | None,
) -> tuple[str, str]:
    """Resolve book title/author.

    Priority: an explicitly-supplied title/author → EPUB metadata → the
    uploaded filename stem (→ ``'Unknown'`` for author). The parser extracts
    dc:title/dc:creator, so when the caller passes no explicit value we prefer
    the real metadata over the bare filename. (Previously this compared the
    title against ``Path(file_path).stem`` — but ``file_path`` is the *temp*
    path, whose stem never matches, so metadata overrides silently never fired.)
    """
    meta = result.get('metadata', {})
    stem = Path(original_filename).stem if original_filename else ''
    book_title = title or meta.get('title') or stem or 'Untitled'
    book_author = author or meta.get('author') or 'Unknown'
    return book_title, book_author


_COVER_DATA_URI_RE = re.compile(r'^data:(?P<mime>[-\w/+.]+);base64,(?P<b64>.+)$', re.DOTALL)
_COVER_MIME_TO_EXT = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
}


def _decode_cover_data_uri(uri: str) -> tuple[bytes, str, str] | None:
    """Decode a `data:{mime};base64,{...}` cover URI into (bytes, ext, mime)."""
    match = _COVER_DATA_URI_RE.match(uri)
    if not match:
        return None
    mime = match.group('mime')
    try:
        data = base64.b64decode(match.group('b64'), validate=True)
    except ValueError:
        # binascii.Error (invalid base64) is a ValueError subclass.
        return None
    if not data:
        return None
    return data, _COVER_MIME_TO_EXT.get(mime, 'jpg'), mime


async def _resolve_cover_url(book_id: UUID, meta: dict) -> str | None:
    """Upload the EPUB-extracted cover to object storage; return its URL.

    The parser leaves the cover as a base64 data URI in ``meta['cover_data_uri']``.
    We decode it and push the bytes to OSS so ``cover_url`` is a short public
    URL the frontend can render. Returns ``None`` when storage is unconfigured,
    the cover is missing, or the upload fails — caller falls back to the
    gradient placeholder.
    """
    uri = meta.get('cover_data_uri')
    if not uri:
        return None
    decoded = _decode_cover_data_uri(uri)
    if not decoded:
        return None
    data, ext, mime = decoded
    return await upload_cover(book_id, data, ext, mime)


async def _persist_book_and_document(
    db: AsyncSession,
    user_id: UUID,
    book_title: str,
    book_author: str,
    file_type: str,
    file_size: int,
    cover_url: str | None,
    tags: list[str] | None,
    result: dict,
    meta: dict,
    content_hash: str | None = None,
) -> tuple[Book, UUID]:
    """Create Book and Document records; return (book, document_id)."""
    async with db_error_guard(
        'upload_service._persist_book_and_document',
    ):
        book = Book(
            user_id=user_id,
            title=book_title,
            author=book_author,
            file_type=BookFileType(file_type),
            file_size=file_size,
            content_hash=content_hash,
            total_pages=result.get('total_pages', 0),
            cover_url=cover_url,
            tags=tags or [],
            status='unread',
            metadata_=meta if meta else None,
        )
        db.add(book)
        await db.flush()

        # Upload the extracted cover to object storage so book.cover_url points
        # at a renderable public URL. Respects an explicitly-supplied cover_url;
        # any failure silently falls back to the gradient placeholder.
        if not book.cover_url:
            book.cover_url = await _resolve_cover_url(book.id, meta)

        document = Document(
            book_id=book.id,
            user_id=user_id,
            content=result.get('content', ''),
            chapters=result.get('chapters', []),
        )
        db.add(document)
        await db.flush()
        await db.refresh(book)
    return book, document.id


async def create_book_with_content(
    db: AsyncSession,
    user_id: UUID,
    title: str | None,
    author: str | None,
    file_type: str,
    file_size: int,
    file_path: str,
    cover_url: str | None = None,
    tags: list[str] | None = None,
    original_filename: str | None = None,
    content_hash: str | None = None,
) -> Book:
    """Create a book record and process its content."""
    async with db_error_guard(
        'upload_service.create_book_with_content',
    ):
        result = await _parse_file_content(file_type, file_path)
        meta = result.get('metadata', {})
        book_title, book_author = _resolve_metadata(
            result, original_filename, title, author,
        )

        book, document_id = await _persist_book_and_document(
            db, user_id, book_title, book_author,
            file_type, file_size, cover_url, tags, result, meta,
            content_hash=content_hash,
        )

        # Shared-content dual-write (design r2 step 1): store the immutable
        # parse payload once per distinct file bytes. Idempotent — the first
        # uploader's parse wins; later identical uploads keep their own
        # Book/Document until step 2 switches reads. No behavior change yet.
        if content_hash:
            await upsert_book_content(
                db,
                content_hash=content_hash,
                file_size=file_size,
                file_type=file_type,
                title=book_title,
                author=book_author,
                chapters=[
                    {k: v for k, v in ch.items() if k != 'rawContent'}
                    for ch in result.get('chapters', [])
                ],
                raw_chapters=result.get('chapters'),
                total_pages=result.get('total_pages', 0),
                meta=meta,
                cover_url=cover_url,
                created_by=user_id,
            )

    logger.info(
        'Book created: %s (%s, %d pages, %d chapters, %d images)',
        book_title, file_type, result.get('total_pages', 0),
        len(result.get('chapters', [])),
        sum(ch.get('images', 0) for ch in result.get('chapters', [])),
    )

    # P6.2 (24h-review risk 4): uploads change recentBooks/streak/counts —
    # this was the one major book-write path missing dashboard invalidation.
    from app.services.stats.dashboard_cache import invalidate_user_caches
    await invalidate_user_caches(user_id)

    asyncio.create_task(
        _safe_precompute(book.id, document_id, result['chapters'], content_hash)
    )
    return book


async def get_book_content(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    lang: str = DEFAULT_LANGUAGE,
    slim: bool = False,
) -> dict | None:
    """Fetch book content and chapters. Returns None if book not found.

    ``slim=True`` omits the top-level plain-text ``content`` copy: it
    duplicates every chapter's ``content`` and no client reads it (the
    reader renders ``chapters[].rawContent``; in-book search uses
    ``chapters[].content``). For multi-MB books this cuts the payload by
    roughly a third. Non-slim responses stay byte-compatible for existing
    clients (mobile).
    """
    async with db_error_guard('upload_service.get_book_content'):
        result = await db.execute(
            select(Book).where(Book.id == book_id, Book.user_id == user_id),
        )
        book = result.scalar_one_or_none()
        if book is None:
            return None

        # Heavy part first from cache — the Document row is multi-MB and the
        # DB is often remote; a hit skips the widest query entirely.
        chapters = await _get_cached_chapters(book_id)
        cache_hit = chapters is not None
        shared = None
        if not cache_hit and book.content_hash:
            # Shared-content read (design r2 step 2): one book_contents row
            # serves every user's copy of the same bytes. Fallback to the
            # legacy Document below keeps pre-0026 books working.
            shared = await _get_shared_content(db, book.content_hash)
            if shared is not None:
                chapters = _chapters_from_shared(shared)
        if not cache_hit and shared is None:
            doc_result = await db.execute(
                select(Document).where(Document.book_id == book_id),
            )
            doc = doc_result.scalar_one_or_none()

    if cache_hit:
        content = '\n'.join(
            ch.get('content', '') for ch in chapters if isinstance(ch, dict)
        )
    elif shared is not None:
        content = '\n'.join(
            ch.get('content', '') for ch in chapters if isinstance(ch, dict)
        )
        await _put_cached_chapters(book_id, chapters)
    else:
        content = _extract_content(doc)
        chapters = _build_chapters(doc, lang)
        await _put_cached_chapters(book_id, chapters)

    if not chapters and not content:
        safe_title = sanitize_book_field(book.title, field='title')
        safe_author = sanitize_book_field(book.author, field='author')
        content = t('errors.sample_content', lang, title=safe_title, author=safe_author)
        chapters = [{
            'id': 'sample-0',
            'title': t('errors.sample_title', lang, title=safe_title),
            'content': content,
            'rawContent': content,
        }]

    return {
        'book': {
            'id': str(book.id),
            'title': book.title,
            'author': book.author,
            'fileType': book.file_type.value if hasattr(book.file_type, 'value') else book.file_type,
            'fileSize': book.file_size,
            'totalPages': book.total_pages,
            'currentPage': book.current_page,
            'currentSegment': book.current_segment or 0,
            'progress': float(book.progress) if book.progress else 0,
            'status': book.status.value if hasattr(book.status, 'value') else book.status,
            'tags': book.tags or [],
            'metadata': book.metadata_,
        },
        'chapters': chapters,
        **({} if slim else {'content': content}),
    }


def _extract_content(doc: Document | None) -> str:
    """Extract plain text content from a Document."""
    if not doc:
        return ''
    if hasattr(doc, 'content') and doc.content:
        return doc.content
    if hasattr(doc, 'chapters') and doc.chapters:
        return '\n'.join(
            ch.get('content', '') for ch in doc.chapters if isinstance(ch, dict)
        )
    return ''


async def _safe_precompute(
    book_id: UUID,
    document_id: UUID,
    chapters: list[dict],
    content_hash: str | None = None,
) -> None:
    """Fire-and-forget embedding pre-computation with retry."""
    from app.services.rag import precompute_book_embeddings

    max_retries = 2
    for attempt in range(max_retries + 1):
        try:
            await precompute_book_embeddings(book_id, document_id, chapters, content_hash)
            return
        except Exception as exc:
            retriable = isinstance(exc, (ConnectionError, TimeoutError, ValueError))
            if retriable and attempt < max_retries:
                delay = 2 ** attempt * 5
                logger.warning(
                    'Embedding pre-computation attempt %d/%d failed for book %s, retrying in %ds: %s',
                    attempt + 1, max_retries + 1, book_id, delay, str(exc)[:200],
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    'Background embedding pre-computation failed after %d attempts for book %s: %s',
                    attempt + 1, book_id, exc, exc_info=not retriable,
                )
