"""EPUB processing via the stdlib zipfile path (the only production path).

Retired the ebooklib sibling (M3.4): ebooklib is blocked on Python 3.13
(lxml), so the ebooklib-first branch never ran in prod or CI.
"""

import logging
import re
import zipfile
from pathlib import Path
from xml.etree.ElementTree import ParseError as XMLParseError

from app.services.parsers.epub.css import extract_epub_css
from app.services.parsers.epub._html_clean import _strip_dangerous_html, _strip_duplicate_heading
from app.services.parsers.epub.footnotes import annotate_footnotes
from app.services.parsers.epub.footnote_defs import (
    MAX_FOOTNOTE_DEFS,
    extract_footnote_definitions,
    strip_footnote_blocks,
)
from app.services.parsers.epub.html_helpers import (
    count_images,
    extract_html_heading,
    extract_html_title,
    resolve_epub_path,
)
from app.services.parsers.epub.images import extract_cover, extract_images, rewrite_image_sources
from app.services.parsers.epub.structural import (
    parse_epub_container,
    parse_nav,
    parse_ncx,
    parse_opf,
)
from app.services.parsers.epub.boilerplate import coalesce_fragments_html, coalesce_fragments_text, scrub_chapter
from app.services.parsers.epub.constants import OUTER_DOC_WRAPPER

logger = logging.getLogger('read-pal')

# Zip-bomb defense: cap total uncompressed bytes parsed from the archive.
# A 100 MB upload of highly compressible content can decompress to ~10 GB;
# reject archives whose declared uncompressed size exceeds this cap.
_MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024  # 200 MB


async def epub_zip_fallback(file_path: str) -> tuple[list[dict], list[str], int]:
    """Process EPUB using zipfile (no ebooklib dependency)."""
    chapters: list[dict] = []
    full_text_parts: list[str] = []
    metadata: dict = {}
    opf_path = ''

    with zipfile.ZipFile(file_path, 'r') as zf:
        # Reject zip bombs before any extraction: sum of declared uncompressed
        # sizes must stay under the cap. A small compressed archive can declare
        # huge uncompressed sizes; we refuse to even start parsing in that case.
        total_uncompressed = sum(info.file_size for info in zf.infolist())
        if total_uncompressed > _MAX_UNCOMPRESSED_BYTES:
            logger.warning(
                'epub.zip_too_large uncompressed=%d cap=%d path=%s',
                total_uncompressed, _MAX_UNCOMPRESSED_BYTES, file_path,
            )
            return [], [], 1

        opf_data, toc_map, image_map, css_str, metadata, opf_path = (
            _parse_structure(zf)
        )

        spine_hrefs = _resolve_spine(zf, opf_data, opf_path)

        chapters, full_text_parts, footnote_defs = _build_chapters(
            zf, spine_hrefs, opf_path, toc_map, image_map, css_str,
        )

        cover_uri = None
        if opf_data:
            try:
                cover_uri = extract_cover(
                    zf, opf_data.get('manifest', {}), opf_data, opf_path,
                )
            except (KeyError, zipfile.BadZipFile, ValueError) as exc:
                logger.warning('epub_parser.cover_image_extraction_failed: %s', str(exc)[:200])

    # Single final store: merging footnote_defs here (not storing them inside
    # _build_chapters) keeps store_metadata from clobbering the context var.
    if footnote_defs:
        metadata = {**metadata, 'footnote_definitions': footnote_defs}
    from app.services.parsers.epub.metadata_store import store_metadata
    store_metadata(metadata, cover_uri)
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
    except (KeyError, zipfile.BadZipFile, XMLParseError) as exc:
        logger.warning('EPUB container parsing failed: %s', exc)
        opf_path_raw = None

    if opf_path_raw:
        opf_path = opf_path_raw
        try:
            opf_xml = zf.read(opf_path).decode('utf-8', errors='replace')
            opf_data = parse_opf(opf_xml, opf_path)
            metadata = opf_data.get('metadata', {})
        except (KeyError, zipfile.BadZipFile, UnicodeDecodeError) as exc:
            logger.warning('OPF parsing failed: %s', exc)

    # Parse TOC (NCX then NAV)
    if opf_data:
        toc_map = _parse_toc(zf, opf_data, opf_path)

    # Extract images
    if opf_data:
        try:
            image_map = extract_images(zf, opf_data.get('manifest', {}), opf_path)
        except (KeyError, zipfile.BadZipFile, ValueError) as exc:
            logger.warning('Image extraction failed: %s', exc)

    # Extract CSS
    if opf_data:
        try:
            css_str = extract_epub_css(zf, opf_data.get('manifest', {}), opf_path)
        except (KeyError, zipfile.BadZipFile, UnicodeDecodeError) as exc:
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
    except (KeyError, zipfile.BadZipFile, UnicodeDecodeError, XMLParseError) as exc:
        logger.warning('NCX parsing failed: %s', exc)

    try:
        nav_href = opf_data.get('nav_href')
        if nav_href and not toc_entries:
            nav_path = resolve_epub_path(opf_path, nav_href)
            nav_xml = zf.read(nav_path).decode('utf-8', errors='replace')
            toc_entries = parse_nav(nav_xml)
    except (KeyError, zipfile.BadZipFile, UnicodeDecodeError, XMLParseError) as exc:
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


_FRONT_MATTER_TITLE_RE = re.compile(r'^(contents|目录|目錄|table of contents)$', re.IGNORECASE)


def _is_toc_page(raw_html: str, text: str, title: str | None = None) -> bool:
    """Detect a dedicated table-of-contents page.

    Publishers put the TOC in the spine as its own file; parsing it as a
    "chapter" yields a dead 20-char chapter of link labels between the
    preface and chapter 1. Detection is two-pronged:
    1. Link-dominance: short text (≤2000 chars — real chapters blow past
       this long before the link checks; Gutenberg TOC pages reach ~600
       after boilerplate scrubbing), dominated by internal links pointing
       at OTHER spine files (not footnotes/anchors within itself).
    2. Title match: NCX/NAV titles the file "Contents"/"目录" — some old
       Gutenberg files render the TOC as PLAIN TEXT with no internal
       links, which prong 1 can never see.
    Callers should pass boilerplate-scrubbed html/text.
    """
    stripped = text.strip()
    if title and len(stripped) < 1500 and _FRONT_MATTER_TITLE_RE.match(title.strip()):
        return True
    if len(stripped) > 2000:
        return False
    links = re.findall(r'<a\s[^>]*href="([^"#]+#[^"]*|[^"#]+)"[^>]*>', raw_html)
    if not links:
        return False
    # Every link target a distinct file (TOC pattern); self-referencing
    # footnote links disqualify.
    targets = {h.split('#')[0] for h in links if h.split('#')[0]}
    if len(targets) < 2:
        return False
    # A TOC page's visible words are almost entirely link labels.
    # Links + the page heading should cover most of the non-whitespace
    # text (structured-text output pads with blank lines; real chapters
    # exceed the 400-char gate long before reaching this check).
    link_chars = sum(
        len(re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', m)))
        for m in re.findall(r'<a\s[^>]*>.*?</a>', raw_html, re.DOTALL)
    )
    heading_chars = sum(
        len(re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', m)))
        for m in re.findall(r'<h[1-3][^>]*>.*?</h[1-3]>', raw_html, re.DOTALL)
    )
    non_ws = len(re.sub(r'\s+', '', stripped))
    return link_chars + heading_chars >= non_ws * 0.5


def _build_chapters(
    zf: zipfile.ZipFile,
    spine_hrefs: list[tuple[str, str]],
    opf_path: str,
    toc_map: dict[str, tuple[str, int]],
    image_map: dict[str, str],
    css_str: str,
) -> tuple[list[dict], list[str], dict[str, str]]:
    """Build chapters in spine order from ZIP entries."""
    from app.services.text_helpers import html_to_structured_text

    chapters: list[dict] = []
    full_text_parts: list[str] = []
    order = 0
    # Scoped definition map: ``rpfnd-ch{chapterIndex}-{anchorId}`` → text.
    # Per-chapter footnote numbering restarts (every chapter defines its
    # own note_1), so a flat {anchorId: text} map gets silently corrupted
    # by whichever notes-bearing file is processed last (2026-09-23
    # badcase: marker [1] in ch2 popped another chapter's note_1 — a
    # Kipling bio instead of the pound-unit note).
    footnote_defs: dict[str, str] = {}
    # Pass A: extract per-file definitions BEFORE enrichment, so marker
    # rewriting (pass C) can resolve targets in files not yet processed.
    defs_by_file: dict[str, dict[str, str]] = {}
    for _item_id, href in spine_hrefs:
        resolved = resolve_epub_path(opf_path, href)
        if resolved in defs_by_file:
            continue
        try:
            raw_html = zf.read(resolved).decode('utf-8', errors='replace')
        except (KeyError, zipfile.BadZipFile, UnicodeDecodeError):
            continue
        defs_by_file[resolved] = extract_footnote_definitions(raw_html, resolved)

    chapter_files: list[str] = []  # source file per surviving chapter
    for item_id, href in spine_hrefs:
        resolved = resolve_epub_path(opf_path, href)
        try:
            raw_html = zf.read(resolved).decode('utf-8', errors='replace')
        except (KeyError, zipfile.BadZipFile, UnicodeDecodeError):
            logger.debug('Failed to read chapter from ZIP: %s', resolved, exc_info=True)
            continue

        enriched = _enrich_html(raw_html, resolved, image_map, css_str)
        # Note bodies now live in the metadata map — drop the definition
        # paragraphs from the reading flow (they used to leak as plain
        # text at the end of every chapter).
        enriched = strip_footnote_blocks(enriched)

        text = html_to_structured_text(enriched)
        title = _resolve_title(resolved, raw_html, toc_map)

        # Strip Gutenberg-style boilerplate (header + license) BEFORE the
        # dead-chapter checks: license-only files become empty and TOC pages
        # lose the header text that masked their link dominance.
        text, enriched, title, keep = scrub_chapter(text, enriched, title)
        if not keep:
            continue
        # Ingestion-side fragment coalescing (mirrors the reader's
        # render-layer merge) so RAG chunks and word counts see whole
        # paragraphs. No-op for CJK content.
        text = coalesce_fragments_text(text)
        enriched = coalesce_fragments_html(enriched)
        if _is_toc_page(enriched, text, title):
            logger.debug('Skipping TOC page as chapter: %s', resolved)
            continue

        full_text_parts.append(text)
        text, enriched = _strip_duplicate_heading(title, text, enriched)

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
        chapter_files.append(resolved)
        order += 1

    # Pass C: rewrite marker hrefs to their scoped keys and build the map.
    file_to_idx = {f: i for i, f in enumerate(chapter_files)}
    for i, ch in enumerate(chapters):
        src = chapter_files[i]
        for frag, body in defs_by_file.get(src, {}).items():
            if len(footnote_defs) < MAX_FOOTNOTE_DEFS:
                footnote_defs[f'rpfnd-ch{i}-{frag}'] = body
        ch['rawContent'] = _rewrite_footnote_hrefs(
            ch['rawContent'], src, file_to_idx,
        )

    return chapters, full_text_parts, footnote_defs




def _rewrite_footnote_hrefs(
    html: str,
    src_file: str,
    file_to_idx: dict[str, int],
) -> str:
    """Point marker anchors at their chapter-scoped definition keys.

    ``href="part0003.html#note_1"`` (cross-file InDesign form) and
    ``href="#note_1"`` (same-file form) both become
    ``href="#rpfnd-ch{i}-note_1"`` where ``i`` is the final chapter index
    of the file that owns the definition. The scoped fragment is an
    opaque lookup key for the metadata map — collision-free across the
    per-chapter note numbering. Targets outside the surviving chapter
    list keep their original href (frontend shows its cross-ref
    fallback); noteBack_/fnref_ backlinks are never touched.
    """
    def _sub(m: re.Match) -> str:
        file_part, _, frag = m.group(2).partition('#')
        resolved = resolve_epub_path(src_file, file_part) if file_part else src_file
        idx = file_to_idx.get(resolved)
        if idx is None:
            return m.group(0)
        return f'{m.group(1)}#rpfnd-ch{idx}-{frag}{m.group(3)}'

    return _MARKER_HREF_RE.sub(_sub, html)


# Marker anchors whose href targets a definition id (mirrors
# FOOTNOTE_REF_RE's fragment rules; captures the href value).
_MARKER_HREF_RE = re.compile(
    r'(<a\s[^>]*?href\s*=\s*["\'])'
    r'([^"\']*#(?:note(?!back)|fn(?!ref)|footnote|endnote)[\w.-]*)'
    r'(["\'])',
    re.IGNORECASE,
)


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
    except (KeyError, ValueError):
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



