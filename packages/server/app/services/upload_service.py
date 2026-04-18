"""File upload and content processing service."""

import logging
import re
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookFileType
from app.models.document import Document

if TYPE_CHECKING:
    pass

logger = logging.getLogger('read-pal')

ALLOWED_EXTENSIONS = {'.epub', '.pdf'}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


def validate_file(filename: str, file_size: int) -> str | None:
    """Validate file before processing. Returns error message or None."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return f'Unsupported file type: {ext}. Allowed: {ALLOWED_EXTENSIONS}'
    if file_size > MAX_FILE_SIZE:
        return f'File too large: {file_size} bytes. Max: {MAX_FILE_SIZE} bytes'
    return None


def get_file_type(filename: str) -> str:
    """Extract file type from filename."""
    return Path(filename).suffix.lower().lstrip('.')


async def process_pdf(file_path: str) -> dict:
    """Extract text and chapters from PDF using pypdf."""
    from pypdf import PdfReader

    reader = PdfReader(file_path)
    total_pages = len(reader.pages)
    chapters = []
    full_text_parts = []

    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ''
        if text.strip():
            full_text_parts.append(text)
            chapters.append({
                'id': f'page-{i + 1}',
                'title': f'Page {i + 1}',
                'content': text.strip(),
                'startIndex': 0,
                'endIndex': len(text),
                'order': i,
            })

    full_text = '\n\n'.join(full_text_parts)
    return {
        'total_pages': total_pages,
        'chapters': chapters,
        'content': full_text,
    }


async def process_epub(file_path: str) -> dict:
    """Extract text and chapters from EPUB.

    NOTE: ebooklib requires lxml which is not available on Python 3.13.
    Falls back to basic ZIP-based extraction.
    """
    chapters = []
    full_text_parts = []
    total_pages = 0

    try:
        import ebooklib
        from ebooklib import epub
        from lxml import html as lxml_html

        book = epub.read_epub(file_path)
        order = 0
        for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
            content = item.get_content().decode('utf-8', errors='replace')
            tree = lxml_html.fromstring(content)
            text = tree.text_content().strip()

            if text:
                full_text_parts.append(text)
                chapters.append({
                    'id': item.get_id(),
                    'title': item.get_name(),
                    'content': text,
                    'rawContent': content,
                    'startIndex': 0,
                    'endIndex': len(text),
                    'order': order,
                })
                order += 1

        total_pages = max(1, len(chapters))
    except ImportError:
        logger.warning(
            'ebooklib not available, using ZIP fallback for EPUB',
        )
        chapters, full_text_parts, total_pages = (
            await _epub_zip_fallback(file_path)
        )

    full_text = '\n\n'.join(full_text_parts)
    return {
        'total_pages': total_pages,
        'chapters': chapters,
        'content': full_text,
    }


async def _epub_zip_fallback(
    file_path: str,
) -> tuple[list[dict], list[str], int]:
    """Fallback EPUB parser using zipfile (no lxml dependency)."""
    import zipfile

    chapters = []
    full_text_parts = []
    order = 0

    with zipfile.ZipFile(file_path, 'r') as zf:
        html_files = sorted(
            n for n in zf.namelist()
            if n.endswith(('.html', '.xhtml', '.htm'))
        )

        for name in html_files:
            raw = zf.read(name).decode('utf-8', errors='replace')
            text = re.sub(r'<[^>]+>', '', raw)
            text = re.sub(r'\s+', ' ', text).strip()

            if text and len(text) > 50:
                full_text_parts.append(text)
                chapters.append({
                    'id': f'chapter-{order}',
                    'title': Path(name).stem.replace('-', ' ').title(),
                    'content': text,
                    'startIndex': 0,
                    'endIndex': len(text),
                    'order': order,
                })
                order += 1

    return chapters, full_text_parts, max(1, len(chapters))


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

    book = Book(
        user_id=user_id,
        title=title,
        author=author,
        file_type=BookFileType(file_type),
        file_size=file_size,
        total_pages=result['total_pages'],
        cover_url=cover_url,
        tags=tags or [],
        status='unread',
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
    await db.commit()
    await db.refresh(book)

    logger.info(
        'Book created: %s (%s, %d pages, %d chapters)',
        title,
        file_type,
        result['total_pages'],
        len(result['chapters']),
    )
    return book
