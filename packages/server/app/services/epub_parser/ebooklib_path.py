"""EPUB processing via ebooklib (primary path).

Returns None if ebooklib is not installed, triggering the zipfile fallback.
"""

import base64
import logging
from pathlib import Path

from app.services.epub_parser.constants import IMAGE_MIME_MAP, MAX_IMAGE_SIZE, NS_DC
from app.services.epub_parser.css import sanitize_epub_css
from app.services.epub_parser.footnotes import annotate_footnotes
from app.services.epub_parser.html_helpers import count_images, extract_html_title
from app.services.epub_parser.images import rewrite_image_sources

logger = logging.getLogger('read-pal')


def process_epub_ebooklib(file_path: str) -> dict | None:
    """Process EPUB using ebooklib. Returns None if ebooklib unavailable."""
    try:
        import ebooklib
        from ebooklib import epub
    except ImportError:
        return None

    book = epub.read_epub(file_path)

    toc_map = _build_toc_map(book)
    metadata = _extract_metadata(book)
    image_map = _extract_images(book)
    css_str = _extract_css(book)

    chapters, full_text_parts = _build_chapters(
        book, toc_map, image_map, css_str,
    )

    cover_uri = _extract_cover(book)

    return {
        'total_pages': max(1, len(chapters)),
        'chapters': chapters,
        'content': '\n\n'.join(full_text_parts),
        'metadata': {**metadata, 'cover_data_uri': cover_uri},
    }


def _build_toc_map(book) -> dict[str, tuple[str, int]]:
    """Flatten ebooklib TOC tree into {href: (title, tocLevel)}."""
    toc_map: dict[str, tuple[str, int]] = {}
    try:
        _flatten_toc(book.toc, toc_map, 0)
    except Exception as exc:
        logger.debug('EPUB TOC parsing failed: %s', exc)
    return toc_map


def _flatten_toc(toc, result: dict[str, tuple[str, int]], level: int) -> None:
    """Recursively flatten ebooklib TOC entries."""
    for entry in toc:
        if hasattr(entry, 'href') and hasattr(entry, 'title'):
            href = entry.href.split('#')[0] if entry.href else ''
            title = (entry.title or '').strip()
            if href and title:
                result[href] = (title, level)
        if hasattr(entry, 'children') and entry.children:
            _flatten_toc(entry.children, result, level + 1)
        elif isinstance(entry, (list, tuple)):
            _flatten_toc(entry, result, level)


def _extract_metadata(book) -> dict:
    """Extract metadata from ebooklib book object."""
    metadata: dict = {}
    try:
        for field in ('title', 'creator', 'publisher', 'language', 'date'):
            vals = book.get_metadata(NS_DC, field)
            if not vals:
                continue
            text = vals[0][0] if vals[0] else ''
            key = 'author' if field == 'creator' else ('year' if field == 'date' else field)
            if key == 'year' and text and len(text) >= 4 and text[:4].isdigit():
                metadata[key] = int(text[:4])
            elif key != 'year':
                metadata[key] = text
    except Exception as exc:
        logger.debug('EPUB metadata extraction failed: %s', exc)
    return metadata


def _extract_images(book) -> dict[str, str]:
    """Extract images from ebooklib book into {name: data_uri} map."""
    import ebooklib

    image_map: dict[str, str] = {}
    try:
        for item in book.get_items_of_type(ebooklib.ITEM_IMAGE):
            name = item.get_name()
            content = item.get_content()
            if len(content) > MAX_IMAGE_SIZE:
                continue
            ext = Path(name).suffix.lower()
            mime = IMAGE_MIME_MAP.get(ext, 'image/jpeg')
            b64 = base64.b64encode(content).decode('ascii')
            image_map[name] = f'data:{mime};base64,{b64}'
    except Exception as exc:
        logger.debug('EPUB image extraction failed: %s', exc)
    return image_map


def _extract_css(book) -> str:
    """Extract and sanitize CSS from ebooklib book."""
    import ebooklib

    try:
        css_parts: list[str] = []
        for item in book.get_items_of_type(ebooklib.ITEM_STYLE):
            css_parts.append(item.get_content().decode('utf-8', errors='replace'))
        return sanitize_epub_css('\n'.join(css_parts))
    except Exception as exc:
        logger.debug('EPUB CSS extraction failed: %s', exc)
        return ''


def _build_chapters(
    book,
    toc_map: dict[str, tuple[str, int]],
    image_map: dict[str, str],
    css_str: str,
) -> tuple[list[dict], list[str]]:
    """Build spine-ordered chapter list from ebooklib book."""
    import ebooklib

    from app.services.text_helpers import html_to_structured_text

    spine_ids = [s[0] for s in book.spine] if book.spine else []
    items_by_id: dict[str, object] = {}
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        items_by_id[item.get_id()] = item

    ordered_items = []
    if spine_ids:
        for sid in spine_ids:
            if sid in items_by_id:
                ordered_items.append(items_by_id[sid])
    if not ordered_items:
        ordered_items = list(items_by_id.values())

    chapters: list[dict] = []
    full_text_parts: list[str] = []
    order = 0

    for item in ordered_items:
        content_bytes = item.get_content()
        raw_html = content_bytes.decode('utf-8', errors='replace') if content_bytes else ''
        item_name = item.get_name()

        enriched_html = _enrich_html(raw_html, item_name, image_map, css_str)

        text = html_to_structured_text(enriched_html)
        if not text.strip():
            continue

        full_text_parts.append(text)
        title = _resolve_chapter_title(item_name, raw_html, toc_map)

        chapters.append({
            'id': item.get_id(),
            'title': title,
            'content': text,
            'rawContent': enriched_html,
            'startIndex': 0,
            'endIndex': len(text),
            'order': order,
            'images': count_images(enriched_html),
            'wordCount': len(text.split()),
        })
        order += 1

    return chapters, full_text_parts


def _enrich_html(
    raw_html: str,
    item_name: str,
    image_map: dict[str, str],
    css_str: str,
) -> str:
    """Rewrite images, annotate footnotes, and prepend CSS to HTML."""
    try:
        enriched = rewrite_image_sources(raw_html, image_map, item_name)
    except Exception:
        enriched = raw_html

    enriched = annotate_footnotes(enriched)

    if css_str:
        enriched = f'<style>{css_str}</style>\n{enriched}'

    return enriched


def _resolve_chapter_title(
    item_name: str,
    raw_html: str,
    toc_map: dict[str, tuple[str, int]],
) -> str:
    """Resolve chapter title from TOC, HTML <title>, or filename."""
    for href, (t, _lvl) in toc_map.items():
        if href.endswith(item_name) or item_name.endswith(href):
            return t
    return extract_html_title(raw_html) or Path(item_name).stem


def _extract_cover(book) -> str | None:
    """Extract cover image as data URI from ebooklib book."""
    import ebooklib

    try:
        for item in book.get_items_of_type(ebooklib.ITEM_IMAGE):
            if 'cover' in (item.get_id() or '').lower() or 'cover' in (item.get_name() or '').lower():
                data = item.get_content()
                if data and len(data) <= MAX_IMAGE_SIZE:
                    ext = Path(item.get_name()).suffix.lower()
                    mime = IMAGE_MIME_MAP.get(ext, 'image/jpeg')
                    b64 = base64.b64encode(data).decode('ascii')
                    return f'data:{mime};base64,{b64}'
    except Exception:
        pass
    return None
