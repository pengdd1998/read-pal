"""PDF parsing service — extract text, outlines, and metadata from PDF files."""

import logging
from typing import TYPE_CHECKING

from app.services.text_helpers import fix_garbled_cjk, text_to_html_paragraphs

if TYPE_CHECKING:
    from pypdf import PdfReader

logger = logging.getLogger('read-pal')


# ---------------------------------------------------------------------------
# PDF processing
# ---------------------------------------------------------------------------

def _extract_pdf_metadata(reader: 'PdfReader') -> dict:
    """Extract metadata from PDF."""
    meta = reader.metadata
    if not meta:
        return {}
    result: dict = {}
    for key, target in [
        ('/Title', 'title'), ('/Author', 'author'),
        ('/Subject', 'subject'), ('/Keywords', 'keywords'),
        ('/Producer', 'publisher'),
    ]:
        val = meta.get(key)
        if val:
            text = str(val).strip()
            if text:
                result[target] = text
    return result


def _get_pdf_outlines(reader: 'PdfReader') -> list[dict]:
    """Extract PDF bookmarks/outlines as flat list."""
    outlines_raw = reader.outline
    if not outlines_raw:
        return []

    results: list[dict] = []

    def _walk(items, level: int) -> None:
        for item in items:
            if isinstance(item, list):
                _walk(item, level + 1)
            elif hasattr(item, 'title'):
                title = item.title
                if isinstance(title, bytes):
                    try:
                        title = title.decode('utf-8')
                    except UnicodeDecodeError:
                        title = title.decode('latin-1')
                title = str(title).strip() if title else ''
                page_num = None
                try:
                    page_num = reader.get_destination_page_number(item)
                except Exception as exc:
                    logger.warning('pdf_parser.outline_page_number_failed', error=str(exc)[:200])
                if title and page_num is not None:
                    results.append({
                        'title': title,
                        'page_number': page_num,
                        'toc_level': level,
                    })

    _walk(outlines_raw, 0)
    return results


def _build_pdf_chapters(
    outlines: list[dict],
    pages_text: list[str],
    pages_html: list[str],
    total_pages: int,
) -> list[dict]:
    """Group PDF pages into chapters based on outline entries."""
    if len(outlines) <= 1:
        return []

    chapters: list[dict] = []
    for i, outline in enumerate(outlines):
        start = outline['page_number']
        end = outlines[i + 1]['page_number'] if i + 1 < len(outlines) else total_pages

        # Clamp
        start = max(0, min(start, total_pages - 1))
        end = max(start + 1, min(end, total_pages))

        text_parts = [pages_text[p] for p in range(start, end) if pages_text[p].strip()]
        html_parts = [pages_html[p] for p in range(start, end) if pages_html[p].strip()]

        if not text_parts:
            continue

        content = '\n\n'.join(text_parts)
        raw = '\n'.join(html_parts)

        chapters.append({
            'id': f'section-{i}',
            'title': outline['title'],
            'content': content,
            'rawContent': raw,
            'startIndex': 0,
            'endIndex': len(content),
            'order': i,
            'tocLevel': outline['toc_level'],
            'images': 0,
            'wordCount': len(content.split()),
        })

    return chapters


async def process_pdf(file_path: str) -> dict:
    """Extract text, outlines, and metadata from PDF."""
    from pypdf import PdfReader

    reader = PdfReader(file_path)
    total_pages = len(reader.pages)

    # Extract metadata
    metadata = _extract_pdf_metadata(reader)

    # Extract per-page text and HTML
    pages_text: list[str] = []
    pages_html: list[str] = []
    chapters: list[dict] = []

    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ''
        text = fix_garbled_cjk(text)
        pages_text.append(text.strip())
        pages_html.append(text_to_html_paragraphs(text.strip()))

    # Try outline-based chapters
    try:
        outlines = _get_pdf_outlines(reader)
        outline_chapters = _build_pdf_chapters(outlines, pages_text, pages_html, total_pages)
        if outline_chapters:
            chapters = outline_chapters
    except Exception as exc:
        logger.debug('PDF outline processing failed: %s', exc)

    # Fallback: per-page chapters
    if not chapters:
        for i in range(total_pages):
            text = pages_text[i]
            if text:
                chapters.append({
                    'id': f'page-{i + 1}',
                    'title': f'Page {i + 1}',
                    'content': text,
                    'rawContent': pages_html[i],
                    'startIndex': 0,
                    'endIndex': len(text),
                    'order': i,
                    'images': 0,
                    'wordCount': len(text.split()),
                })

    full_text = '\n\n'.join(ch.get('content', '') for ch in chapters)
    return {
        'total_pages': total_pages,
        'chapters': chapters,
        'content': full_text,
        'metadata': metadata,
    }
