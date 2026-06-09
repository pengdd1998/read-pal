"""EPUB processing via zipfile (fallback path when ebooklib is unavailable).

Uses only stdlib — no ebooklib dependency.
"""

import logging
import re
import zipfile
from pathlib import Path

from app.services.epub_parser.css import extract_epub_css
from app.services.epub_parser.footnotes import annotate_footnotes
from app.services.epub_parser.html_helpers import (
    count_images,
    extract_html_heading,
    extract_html_title,
    resolve_epub_path,
)
from app.services.epub_parser.images import extract_cover, extract_images, rewrite_image_sources
from app.services.epub_parser.structural import (
    parse_epub_container,
    parse_nav,
    parse_ncx,
    parse_opf,
)
from app.services.epub_parser.constants import OUTER_DOC_WRAPPER

logger = logging.getLogger('read-pal')


async def epub_zip_fallback(file_path: str) -> tuple[list[dict], list[str], int]:
    """Process EPUB using zipfile (no ebooklib dependency)."""
    chapters: list[dict] = []
    full_text_parts: list[str] = []
    metadata: dict = {}
    opf_path = ''

    with zipfile.ZipFile(file_path, 'r') as zf:
        opf_data, toc_map, image_map, css_str, metadata, opf_path = (
            _parse_structure(zf)
        )

        spine_hrefs = _resolve_spine(zf, opf_data, opf_path)

        chapters, full_text_parts = _build_chapters(
            zf, spine_hrefs, opf_path, toc_map, image_map, css_str,
        )

        cover_uri = None
        if opf_data:
            try:
                cover_uri = extract_cover(
                    zf, opf_data.get('manifest', {}), opf_data, opf_path,
                )
            except Exception as exc:
                logger.warning('epub_parser.cover_image_extraction_failed: %s', str(exc)[:200])

    _store_metadata(metadata, cover_uri)
    return chapters, full_text_parts, max(1, len(chapters))


def _parse_structure(zf: zipfile.ZipFile) -> tuple:
    """Parse container, OPF, TOC, images, and CSS from the ZIP."""
    opf_path = ''
    opf_data: dict = {}
    metadata: dict = {}
    toc_map: dict[str, tuple[str, int]] = {}
    image_map: dict[str, str] = {}
    css_str = ''

    # Parse container → OPF
    try:
        opf_path_raw = parse_epub_container(zf)
    except Exception as exc:
        logger.warning('EPUB container parsing failed: %s', exc)
        opf_path_raw = None

    if opf_path_raw:
        opf_path = opf_path_raw
        try:
            opf_xml = zf.read(opf_path).decode('utf-8', errors='replace')
            opf_data = parse_opf(opf_xml, opf_path)
            metadata = opf_data.get('metadata', {})
        except Exception as exc:
            logger.warning('OPF parsing failed: %s', exc)

    # Parse TOC (NCX then NAV)
    if opf_data:
        toc_map = _parse_toc(zf, opf_data, opf_path)

    # Extract images
    if opf_data:
        try:
            image_map = extract_images(zf, opf_data.get('manifest', {}), opf_path)
        except Exception as exc:
            logger.warning('Image extraction failed: %s', exc)

    # Extract CSS
    if opf_data:
        try:
            css_str = extract_epub_css(zf, opf_data.get('manifest', {}), opf_path)
        except Exception as exc:
            logger.warning('CSS extraction failed: %s', exc)

    return opf_data, toc_map, image_map, css_str, metadata, opf_path


def _parse_toc(
    zf: zipfile.ZipFile,
    opf_data: dict,
    opf_path: str,
) -> dict[str, tuple[str, int]]:
    """Parse NCX and NAV TOC, returning a resolved href->(title, level) map."""
    toc_entries: list[tuple[str, str, int]] = []
    toc_map: dict[str, tuple[str, int]] = {}

    try:
        ncx_href = opf_data.get('ncx_href')
        if ncx_href:
            ncx_path = resolve_epub_path(opf_path, ncx_href)
            ncx_xml = zf.read(ncx_path).decode('utf-8', errors='replace')
            toc_entries = parse_ncx(ncx_xml)
    except Exception as exc:
        logger.warning('NCX parsing failed: %s', exc)

    try:
        nav_href = opf_data.get('nav_href')
        if nav_href and not toc_entries:
            nav_path = resolve_epub_path(opf_path, nav_href)
            nav_xml = zf.read(nav_path).decode('utf-8', errors='replace')
            toc_entries = parse_nav(nav_xml)
    except Exception as exc:
        logger.warning('Nav parsing failed: %s', exc)

    for title, href, level in toc_entries:
        if href:
            resolved = resolve_epub_path(opf_path, href)
            toc_map[resolved] = (title, level)

    return toc_map


def _resolve_spine(
    zf: zipfile.ZipFile,
    opf_data: dict,
    opf_path: str,
) -> list[tuple[str, str]]:
    """Resolve spine idrefs to (id, href) pairs."""
    manifest = opf_data.get('manifest', {})
    spine = opf_data.get('spine', [])

    spine_hrefs: list[tuple[str, str]] = []
    for idref in spine:
        info = manifest.get(idref)
        if not info:
            continue
        href = info.get('href', '')
        mt = info.get('media_type', '')
        if mt and not mt.startswith(('application/xhtml', 'text/html')):
            if not href.endswith(('.html', '.xhtml', '.htm')):
                continue
        spine_hrefs.append((idref, href))

    if not spine_hrefs:
        html_files = sorted(
            n for n in zf.namelist()
            if n.endswith(('.html', '.xhtml', '.htm'))
        )
        spine_hrefs = [(f'fallback-{i}', h) for i, h in enumerate(html_files)]

    return spine_hrefs


def _build_chapters(
    zf: zipfile.ZipFile,
    spine_hrefs: list[tuple[str, str]],
    opf_path: str,
    toc_map: dict[str, tuple[str, int]],
    image_map: dict[str, str],
    css_str: str,
) -> tuple[list[dict], list[str]]:
    """Build chapters in spine order from ZIP entries."""
    from app.services.text_helpers import html_to_structured_text

    chapters: list[dict] = []
    full_text_parts: list[str] = []
    order = 0

    for item_id, href in spine_hrefs:
        resolved = resolve_epub_path(opf_path, href)
        try:
            raw_html = zf.read(resolved).decode('utf-8', errors='replace')
        except Exception as exc:
            logger.debug('Failed to read chapter from ZIP: %s', resolved, exc_info=True)
            continue

        enriched = _enrich_html(raw_html, resolved, image_map, css_str)

        text = html_to_structured_text(enriched)
        if not text.strip() or len(text.strip()) < 20:
            continue

        full_text_parts.append(text)

        title = _resolve_title(resolved, raw_html, toc_map)

        chapters.append({
            'id': item_id,
            'title': title,
            'content': text,
            'rawContent': enriched,
            'startIndex': 0,
            'endIndex': len(text),
            'order': order,
            'images': count_images(enriched),
            'wordCount': len(text.split()),
        })
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
_DANGEROUS_URL_RE = re.compile(
    r'(href|src|xlink:href)\s*=\s*["\']?\s*(javascript|vbscript|data)\s*:[^"\'">\s]*',
    re.IGNORECASE,
)


def _strip_dangerous_html(html: str) -> str:
    """Remove script tags, event handlers, and dangerous URLs from HTML."""
    html = _DANGEROUS_TAG_RE.sub('', html)
    html = _EVENT_HANDLER_RE.sub('', html)
    html = _DANGEROUS_URL_RE.sub(r'\1=""', html)
    return html


def _enrich_html(
    raw_html: str,
    resolved: str,
    image_map: dict[str, str],
    css_str: str,
) -> str:
    """Rewrite images, annotate footnotes, sanitize, and prepend CSS."""
    html = _strip_outer_wrapper(raw_html)

    try:
        enriched = rewrite_image_sources(html, image_map, resolved)
    except Exception as exc:
        logger.debug('Image source rewrite failed for %s', resolved, exc_info=True)
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


def _resolve_title(
    resolved: str,
    raw_html: str,
    toc_map: dict[str, tuple[str, int]],
) -> str:
    """Resolve chapter title from TOC, HTML <title>, or filename."""
    toc_entry = toc_map.get(resolved)
    if toc_entry:
        return toc_entry[0]
    return (
        extract_html_title(raw_html)
        or extract_html_heading(raw_html)
        or Path(resolved).stem.replace('-', ' ').title()
    )


def _store_metadata(metadata: dict, cover_uri: str | None) -> None:
    """Store metadata via context-local variable for orchestrator."""
    import app.services.epub_parser as pkg

    pkg._set_metadata({**metadata, 'cover_data_uri': cover_uri})
