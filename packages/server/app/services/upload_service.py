"""File upload and content processing service."""

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookFileType
from app.models.document import Document
from app.services.epub_parser import process_epub
from app.services.pdf_parser import process_pdf
from app.services.text_helpers import (
    text_to_html_paragraphs as _text_to_html_paragraphs,
)
from app.utils.db import db_error_guard
from app.utils.i18n import t, DEFAULT_LANGUAGE

logger = logging.getLogger('read-pal')

ALLOWED_EXTENSIONS = {'.epub', '.pdf'}
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


def get_file_type(filename: str) -> str:
    """Extract file type from filename."""
    return Path(filename).suffix.lower().lstrip('.')


# ---------------------------------------------------------------------------
# Tempfile streaming
# ---------------------------------------------------------------------------


async def stream_upload_to_tempfile(
    file: UploadFile,
    max_size: int = MAX_FILE_SIZE,
) -> tuple[str, int]:
    """Stream uploaded file to a temp file.

    Returns (tmp_path, file_size).
    Raises ValueError if the file exceeds *max_size*.
    """
    file_type = get_file_type(file.filename or '')
    file_size = 0

    with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{file_type}') as tmp:
        tmp_path = tmp.name
        while chunk := await file.read(1024 * 1024):
            file_size += len(chunk)
            if file_size > max_size:
                tmp.close()
                os.unlink(tmp_path)
                raise ValueError(
                    f'File exceeds {max_size // (1024 * 1024)} MB limit'
                )
            tmp.write(chunk)

    return tmp_path, file_size


# ---------------------------------------------------------------------------
# Book creation orchestrator
# ---------------------------------------------------------------------------

async def _parse_file_content(file_type: str, file_path: str) -> dict:
    """Parse an uploaded file and return the extraction result."""
    if file_type == 'pdf':
        return await process_pdf(file_path)
    return await process_epub(file_path)


def _resolve_metadata(
    result: dict,
    file_path: str,
    title: str,
    author: str,
) -> tuple[str, str]:
    """Resolve book title/author, preferring extracted metadata over defaults."""
    meta = result.get('metadata', {})
    book_title = title
    book_author = author
    if meta.get('title') and title == Path(file_path).stem:
        book_title = meta['title']
    if meta.get('author') and author == 'Unknown':
        book_author = meta['author']
    return book_title, book_author


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
            total_pages=result.get('total_pages', 0),
            cover_url=cover_url,
            tags=tags or [],
            status='unread',
            metadata_=meta if meta else None,
        )
        db.add(book)
        await db.flush()

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
    title: str,
    author: str,
    file_type: str,
    file_size: int,
    file_path: str,
    cover_url: str | None = None,
    tags: list[str] | None = None,
) -> Book:
    """Create a book record and process its content."""
    async with db_error_guard(
        'upload_service.create_book_with_content',
    ):
        result = await _parse_file_content(file_type, file_path)
        meta = result.get('metadata', {})
        book_title, book_author = _resolve_metadata(
            result, file_path, title, author,
        )

        book, document_id = await _persist_book_and_document(
            db, user_id, book_title, book_author,
            file_type, file_size, cover_url, tags, result, meta,
        )

    logger.info(
        'Book created: %s (%s, %d pages, %d chapters, %d images)',
        book_title, file_type, result.get('total_pages', 0),
        len(result.get('chapters', [])),
        sum(ch.get('images', 0) for ch in result.get('chapters', [])),
    )

    asyncio.create_task(
        _safe_precompute(book.id, document_id, result['chapters'])
    )
    return book


async def get_book_content(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    lang: str = DEFAULT_LANGUAGE,
) -> dict | None:
    """Fetch book content and chapters. Returns None if book not found."""
    async with db_error_guard('upload_service.get_book_content'):
        result = await db.execute(
            select(Book).where(Book.id == book_id, Book.user_id == user_id),
        )
        book = result.scalar_one_or_none()
        if book is None:
            return None

        doc_result = await db.execute(
            select(Document).where(Document.book_id == book_id),
        )
        doc = doc_result.scalar_one_or_none()

    content = _extract_content(doc)
    chapters = _build_chapters(doc, lang)

    if not chapters and not content:
        content = t('errors.sample_content', lang, title=book.title, author=book.author)
        chapters = [{
            'id': 'sample-0',
            'title': t('errors.sample_title', lang, title=book.title),
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
        'content': content,
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


async def _safe_precompute(
    book_id: UUID,
    document_id: UUID,
    chapters: list[dict],
) -> None:
    """Fire-and-forget embedding pre-computation with retry."""
    from app.services.rag import precompute_book_embeddings

    max_retries = 2
    for attempt in range(max_retries + 1):
        try:
            await precompute_book_embeddings(book_id, document_id, chapters)
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
