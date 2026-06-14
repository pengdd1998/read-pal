"""EPUB processing via ebooklib (primary path).

Returns None if ebooklib is not installed, triggering the zipfile fallback.
"""

import base64
import logging
import re
from pathlib import Path
from typing import Any

from app.services.epub_parser.constants import IMAGE_MIME_MAP, MAX_IMAGE_SIZE, NS_DC, OUTER_DOC_WRAPPER
from app.services.epub_parser.css import sanitize_epub_css
from app.services.epub_parser.footnotes import annotate_footnotes
from app.services.epub_parser.html_helpers import (
    count_images, extract_html_heading, extract_html_title,
)
from app.services.epub_parser.images import rewrite_image_sources

logger = logging.getLogger('read-pal')


def process_epub_ebooklib(file_path: str) -> dict | None:
    """Process EPUB using ebooklib. Returns None if ebooklib unavailable."""
    try:
        import ebooklib
        from ebooklib import epub
    except ImportError:
        logger.debug('epub.ebooklib_not_available')
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


def _build_toc_map(book: Any) -> dict[str, tuple[str, int]]:
    """Flatten ebooklib TOC tree into {href: (title, tocLevel)}."""
    toc_map: dict[str, tuple[str, int]] = {}
    try:
        _flatten_toc(book.toc, toc_map, 0)
    except (KeyError, AttributeError, ValueError) as exc:
        logger.warning('EPUB TOC parsing failed: %s', exc)
    return toc_map


def _flatten_toc(toc: Any, result: dict[str, tuple[str, int]], level: int) -> None:
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


def _extract_metadata(book: Any) -> dict:
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
    except (KeyError, AttributeError, UnicodeDecodeError) as exc:
        logger.warning('EPUB metadata extraction failed: %s', exc)
    return metadata


def _extract_images(book: Any) -> dict[str, str]:
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
    except (KeyError, AttributeError, ValueError) as exc:
        logger.warning('EPUB image extraction failed: %s', exc)
    return image_map


def _extract_css(book: Any) -> str:
    """Extract and sanitize CSS from ebooklib book."""
    import ebooklib

    try:
        css_parts: list[str] = []
        for item in book.get_items_of_type(ebooklib.ITEM_STYLE):
            css_parts.append(item.get_content().decode('utf-8', errors='replace'))
        return sanitize_epub_css('\n'.join(css_parts))
    except (KeyError, AttributeError, UnicodeDecodeError) as exc:
        logger.debug('EPUB CSS extraction failed: %s', exc)
        return ''


def _ordered_spine_items(book: Any) -> list[Any]:
    """Return document items in spine order, or all documents if no spine."""
    import ebooklib

    items_by_id: dict[str, object] = {}
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        items_by_id[item.get_id()] = item

    spine_ids = [s[0] for s in book.spine] if book.spine else []
    if spine_ids:
        ordered = [items_by_id[sid] for sid in spine_ids if sid in items_by_id]
        if ordered:
            return ordered
    return list(items_by_id.values())


def _process_chapter_item(
    item: Any,
    toc_map: dict[str, tuple[str, int]],
    image_map: dict[str, str],
    css_str: str,
    order: int,
) -> tuple[dict | None, str | None]:
    """Process a single document item into a chapter dict + text.

    Returns (chapter_dict, text) or (None, None) if empty.
    """
    from app.services.text_helpers import html_to_structured_text

    content_bytes = item.get_content()
    raw_html = content_bytes.decode('utf-8', errors='replace') if content_bytes else ''
    item_name = item.get_name()

    enriched_html = _enrich_html(raw_html, item_name, image_map, css_str)
    text = html_to_structured_text(enriched_html)
    if not text.strip():
        return None, None

    title = _resolve_chapter_title(item_name, raw_html, toc_map)
    chapter = {
        'id': item.get_id(),
        'title': title,
        'content': text,
        'rawContent': enriched_html,
        'startIndex': 0,
        'endIndex': len(text),
        'order': order,
        'images': count_images(enriched_html),
        'wordCount': len(text.split()),
    }
    return chapter, text


def _build_chapters(
    book: Any,
    toc_map: dict[str, tuple[str, int]],
    image_map: dict[str, str],
    css_str: str,
) -> tuple[list[dict], list[str]]:
    """Build spine-ordered chapter list from ebooklib book."""
    ordered_items = _ordered_spine_items(book)

    chapters: list[dict] = []
    full_text_parts: list[str] = []
    order = 0

    for item in ordered_items:
        chapter, text = _process_chapter_item(item, toc_map, image_map, css_str, order)
        if chapter is None:
            continue
        chapters.append(chapter)
        full_text_parts.append(text)
        order += 1

    return chapters, full_text_parts


_DANGEROUS_TAG_RE = re.compile(
    r'<\s*/?\s*(script|iframe|object|embed|applet|form|input|button|textarea|select|option|meta|link|base|svg|math|noscript|template)\b[^>]*>',
    re.IGNORECASE,
)
_EVENT_HANDLER_RE = re.compile(
    r'\bon\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)',
    re.IGNORECASE,
)
_SCRIPT_URL_RE = re.compile(
    r'(href|src|xlink:href)\s*=\s*["\']?\s*(?:javascript|vbscript)\s*:[^"\'">\s]*',
    re.IGNORECASE,
)
# Block `data:` URIs EXCEPT `data:image/...`. Embedded illustrations are stored
# as base64 data URIs and are legitimate; the frontend DOMPurify pass
# re-sanitizes them. Other data schemes (e.g. data:text/html) stay blocked.
_DATA_URL_RE = re.compile(
    r'(href|src|xlink:href)\s*=\s*["\']?\s*data:(?!image/)[^"\'">\s]*',
    re.IGNORECASE,
)


def _strip_dangerous_html(html: str) -> str:
    """Remove script tags, event handlers, and dangerous URLs from HTML."""
    # Strip NULL bytes and other control chars that browsers ignore when
    # resolving URL schemes. Without this, `java\x00script:alert(1)` bypasses
    # the URL regexes because they don't see `javascript:` contiguously.
    # Keep tab/newline/CR (\x09, \x0A, \x0D) since they're structural in HTML.
    html = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', html)
    html = _DANGEROUS_TAG_RE.sub('', html)
    html = _EVENT_HANDLER_RE.sub('', html)
    html = _SCRIPT_URL_RE.sub(r'\1=""', html)
    html = _DATA_URL_RE.sub(r'\1=""', html)
    return html


def _enrich_html(
    raw_html: str,
    item_name: str,
    image_map: dict[str, str],
    css_str: str,
) -> str:
    """Rewrite images, annotate footnotes, and prepend CSS to HTML."""
    # Strip outer document wrapper (<?xml>, <!DOCTYPE>, <html><head>...<body>)
    html = _strip_outer_wrapper(raw_html)

    try:
        enriched = rewrite_image_sources(html, image_map, item_name)
    except (KeyError, ValueError) as exc:
        logger.debug('Image source rewrite failed for %s', item_name, exc_info=True)
        enriched = html

    enriched = annotate_footnotes(enriched)
    enriched = _strip_dangerous_html(enriched)

    if css_str:
        enriched = f'<style>{css_str}</style>\n{enriched}'

    return enriched


def _strip_outer_wrapper(html: str) -> str:
    """Strip <?xml?>, <!DOCTYPE>, <html><head>...</head><body> wrappers."""
    m = OUTER_DOC_WRAPPER.match(html)
    if m:
        return m.group(1).strip()
    return html


def _resolve_chapter_title(
    item_name: str,
    raw_html: str,
    toc_map: dict[str, tuple[str, int]],
) -> str:
    """Resolve chapter title from TOC, HTML <title>, or filename."""
    for href, (t, _lvl) in toc_map.items():
        if href.endswith(item_name) or item_name.endswith(href):
            return t
    return extract_html_title(raw_html) or extract_html_heading(raw_html) or Path(item_name).stem


def _extract_cover(book: Any) -> str | None:
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
    except (KeyError, AttributeError, ValueError) as exc:
        logger.warning('epub_parser.image_embedding_failed: %s', str(exc)[:200])
    return None
