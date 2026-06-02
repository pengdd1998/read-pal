"""File upload and content processing service."""

import asyncio
import logging
from pathlib import Path
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookFileType
from app.models.document import Document
from app.services.epub_parser import process_epub
from app.services.pdf_parser import process_pdf
from app.services.text_helpers import (
    fix_garbled_cjk as _fix_garbled_cjk,
    html_to_structured_text as _html_to_structured_text,
    text_to_html_paragraphs as _text_to_html_paragraphs,
)
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
# Book creation orchestrator
# ---------------------------------------------------------------------------

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
    if file_type == 'pdf':
        result = await process_pdf(file_path)
    else:
        result = await process_epub(file_path)

    # Apply extracted metadata
    meta = result.get('metadata', {})
    book_title = title
    book_author = author

    # Override title/author with extracted values if defaults were used
    if meta.get('title') and title == Path(file_path).stem:
        book_title = meta['title']
    if meta.get('author') and author == 'Unknown':
        book_author = meta['author']

    book = Book(
        user_id=user_id,
        title=book_title,
        author=book_author,
        file_type=BookFileType(file_type),
        file_size=file_size,
        total_pages=result['total_pages'],
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
        content=result['content'],
        chapters=result['chapters'],
    )
    db.add(document)
    await db.flush()
    await db.refresh(book)

    logger.info(
        'Book created: %s (%s, %d pages, %d chapters, %d images)',
        book_title,
        file_type,
        result['total_pages'],
        len(result['chapters']),
        sum(ch.get('images', 0) for ch in result['chapters']),
    )

    asyncio.create_task(
        _safe_precompute(book.id, document.id, result['chapters'])
    )

    return book


async def _safe_precompute(
    book_id: UUID,
    document_id: UUID,
    chapters: list[dict],
) -> None:
    """Fire-and-forget embedding pre-computation."""
    try:
        from app.services.rag import precompute_book_embeddings
        await precompute_book_embeddings(book_id, document_id, chapters)
    except Exception as exc:
        logger.error(
            'Background embedding pre-computation failed for book %s: %s',
            book_id, exc,
        )
