"""File upload and content processing service."""

import asyncio
import base64
import html as html_module
import logging
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
from io import BytesIO
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookFileType
from app.models.document import Document
from app.utils.i18n import t, DEFAULT_LANGUAGE

if TYPE_CHECKING:
    from pypdf import PdfReader

logger = logging.getLogger('read-pal')

ALLOWED_EXTENSIONS = {'.epub', '.pdf'}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
MAX_IMAGE_SIZE = 2 * 1024 * 1024  # 2 MB per image before base64

IMAGE_MIME_MAP: dict[str, str] = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
}

# XML namespaces used in EPUB
_NS_DC = 'http://purl.org/dc/elements/1.1/'
_NS_OPF = 'http://www.idpf.org/2007/opf'
_NS_NCX = 'http://www.daisy.org/z3986/2005/ncx/'
_NS_EPUB = 'http://www.idpf.org/2007/ops'

# Pre-compiled regex patterns for HTML processing
_BLOCK_ELEMENTS = re.compile(
    r'</(p|div|h[1-6]|li|blockquote|section|article|tr|td|dt|dd|ul|ol|table|header|footer|main|nav|aside|figure|figcaption|details|summary|address)>',
    re.IGNORECASE,
)
_INLINE_BREAKS = re.compile(r'<br\s*/?\s*>', re.IGNORECASE)
_HTML_TAG = re.compile(r'<[^>]+>')
_HORIZONTAL_WS = re.compile(r'[^\S\n]+')
_EXCESS_NEWLINES = re.compile(r'\n{3,}')
_PARAGRAPH_SPLIT = re.compile(r'\n\s*\n')
_IMG_SRC_RE = re.compile(r'(<img\s[^>]*src=["\'])([^"\']+)(["\'])', re.IGNORECASE)
_TITLE_RE = re.compile(r'<title[^>]*>(.*?)</title>', re.IGNORECASE | re.DOTALL)
_IMG_COUNT_RE = re.compile(r'<img[\s>]', re.IGNORECASE)

# CSS sanitization patterns
_CSS_DANGEROUS = re.compile(
    r'(?:@import|expression\s*\(|-moz-binding|behavior\s*:|javascript\s*:)',
    re.IGNORECASE,
)
_CSS_URL = re.compile(r'url\s*\([^)]*\)', re.IGNORECASE)
_CSS_POSITION_BAD = re.compile(r'position\s*:\s*(?:fixed|absolute)', re.IGNORECASE)
_CSS_FONT_FACE = re.compile(r'@font-face\s*\{[^}]*\}', re.IGNORECASE | re.DOTALL)


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
# HTML / text conversion helpers
# ---------------------------------------------------------------------------

def _fix_garbled_cjk(text: str) -> str:
    """Fix garbled CJK text caused by GBK bytes misinterpreted as Latin-1."""
    cjk_count = len(re.findall(r'[一-鿿]', text))
    total_chars = len(text.replace(' ', ''))
    if total_chars < 50 or cjk_count / max(total_chars, 1) >= 0.05:
        return text

    latin1_suspicious = len(re.findall(r'[À-ÿ¡-¿]{2,}', text))
    if latin1_suspicious < 10:
        return text

    try:
        raw_bytes = text.encode('latin-1', errors='ignore')
        fixed = raw_bytes.decode('gbk', errors='replace')
        fixed_cjk = len(re.findall(r'[一-鿿]', fixed))
        if fixed_cjk > cjk_count * 5:
            return fixed
    except (UnicodeDecodeError, UnicodeEncodeError):
        pass

    return text


def _html_to_structured_text(html_content: str) -> str:
    """Extract text from HTML preserving paragraph breaks."""
    text = _INLINE_BREAKS.sub('\n', html_content)
    text = _BLOCK_ELEMENTS.sub('\n\n', text)
    text = _HTML_TAG.sub('', text)
    text = html_module.unescape(text)
    text = _HORIZONTAL_WS.sub(' ', text)
    text = _EXCESS_NEWLINES.sub('\n\n', text)
    lines = [line.strip() for line in text.split('\n')]
    return '\n'.join(lines).strip()


def _text_to_html_paragraphs(text: str) -> str:
    """Convert plain text to HTML with <p> tags for rendering."""
    paragraphs = _PARAGRAPH_SPLIT.split(text)
    parts: list[str] = []
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        escaped = html_module.escape(p)
        escaped = escaped.replace('\n', '<br>\n')
        parts.append(f'<p>{escaped}</p>')
    return '\n'.join(parts)


def _resolve_epub_path(base: str, href: str) -> str:
    """Resolve a relative href against an OPF base path within an EPUB ZIP."""
    base_dir = posixpath.dirname(base)
    resolved = posixpath.normpath(posixpath.join(base_dir, href))
    # Strip leading ./ or ../ artifacts
    while resolved.startswith('../'):
        resolved = resolved[3:]
    return resolved


def _extract_html_title(html_content: str) -> str | None:
    """Extract <title> text from HTML content."""
    m = _TITLE_RE.search(html_content)
    if m:
        title = html_module.unescape(m.group(1)).strip()
        if title:
            return title
    return None


def _count_images(html: str) -> int:
    """Count <img> elements in HTML."""
    return len(_IMG_COUNT_RE.findall(html))


# ---------------------------------------------------------------------------
# EPUB structural parsers (stdlib only — no ebooklib dependency)
# ---------------------------------------------------------------------------

def _parse_epub_container(zf: zipfile.ZipFile) -> str | None:
    """Parse META-INF/container.xml to locate the OPF file path."""
    try:
        xml_bytes = zf.read('META-INF/container.xml')
    except KeyError:
        return _scan_for_opf(zf)

    root = ET.fromstring(xml_bytes)
    # container.xml has <rootfiles><rootfile full-path="..." media-type="...">
    for rf in root.iter():
        if rf.tag.endswith('rootfile') or rf.tag == 'rootfile':
            mt = rf.get('media-type', '')
            fp = rf.get('full-path', '')
            if 'oebps-package' in mt or fp.endswith('.opf'):
                return fp
    return _scan_for_opf(zf)


def _scan_for_opf(zf: zipfile.ZipFile) -> str | None:
    """Fallback: find OPF file by extension."""
    for name in zf.namelist():
        if name.endswith('.opf') and not name.startswith('__'):
            return name
    return None


def _parse_opf(opf_xml: str, opf_path: str) -> dict:
    """Parse OPF package document for manifest, spine, metadata."""
    root = ET.fromstring(opf_xml)

    # --- Manifest: id → {href, media_type, properties} ---
    manifest: dict[str, dict] = {}
    for item in root.iter():
        tag = item.tag
        if '}' in tag:
            tag = tag.split('}', 1)[1]
        if tag != 'item':
            continue
        item_id = item.get('id', '')
        manifest[item_id] = {
            'href': item.get('href', ''),
            'media_type': item.get('media-type', ''),
            'properties': item.get('properties', ''),
        }

    # --- Spine: ordered list of idrefs ---
    spine: list[str] = []
    for itemref in root.iter():
        tag = itemref.tag
        if '}' in tag:
            tag = tag.split('}', 1)[1]
        if tag == 'itemref':
            idref = itemref.get('idref', '')
            if idref:
                spine.append(idref)

    # --- Metadata ---
    metadata: dict = {}
    for el in root.iter():
        tag = el.tag
        if '}' in tag:
            ns, local = tag.split('}', 1)
            if ns == '{' + _NS_DC:
                text = (el.text or '').strip()
                if text:
                    key = local
                    if key == 'creator':
                        key = 'author'
                    if key == 'date':
                        key = 'year'
                        # Extract year from date string
                        if len(text) >= 4 and text[:4].isdigit():
                            text = int(text[:4])  # type: ignore[assignment]
                        else:
                            continue
                    metadata[key] = text

    # --- Cover detection ---
    cover_id: str | None = None
    for meta in root.iter():
        tag = meta.tag
        if '}' in tag:
            tag = tag.split('}', 1)[1]
        if tag == 'meta' and meta.get('name') == 'cover':
            cover_id = meta.get('content')
            break
    if not cover_id:
        for iid, info in manifest.items():
            if 'cover-image' in info.get('properties', ''):
                cover_id = iid
                break
    if not cover_id:
        for iid, info in manifest.items():
            if 'cover' in iid.lower() and info['media_type'].startswith('image/'):
                cover_id = iid
                break

    # --- TOC references ---
    ncx_href: str | None = None
    nav_href: str | None = None
    for iid, info in manifest.items():
        mt = info['media_type']
        props = info.get('properties', '')
        if mt == 'application/x-dtbncx+xml':
            ncx_href = info['href']
        if 'nav' in props:
            nav_href = info['href']

    return {
        'manifest': manifest,
        'spine': spine,
        'metadata': metadata,
        'cover_id': cover_id,
        'ncx_href': ncx_href,
        'nav_href': nav_href,
        'opf_path': opf_path,
    }


def _parse_ncx(ncx_xml: str) -> list[tuple[str, str, int]]:
    """Parse NCX (EPUB 2) table of contents."""
    root = ET.fromstring(ncx_xml)
    results: list[tuple[str, str, int]] = []

    def _walk_navpoints(parent, level: int) -> None:
        for el in parent:
            tag = el.tag
            if '}' in tag:
                tag = tag.split('}', 1)[1]
            if tag != 'navPoint':
                continue
            title_el = el.find(f'{{{_NS_NCX}}}navLabel/{{{_NS_NCX}}}text')
            title = (title_el.text or '').strip() if title_el is not None else ''
            content_el = el.find(f'{{{_NS_NCX}}}content')
            src = content_el.get('src', '') if content_el is not None else ''
            # Strip fragment from src
            src = src.split('#')[0]
            if title:
                results.append((title, src, level))
            _walk_navpoints(el, level + 1)

    # Find navMap (with or without namespace)
    nav_map = root.find(f'{{{_NS_NCX}}}navMap')
    if nav_map is None:
        for el in root:
            tag = el.tag.split('}', 1)[-1] if '}' in el.tag else el.tag
            if tag == 'navMap':
                nav_map = el
                break
    if nav_map is not None:
        _walk_navpoints(nav_map, 0)

    return results


def _parse_nav(nav_xml: str) -> list[tuple[str, str, int]]:
    """Parse EPUB 3 nav document for table of contents."""
    root = ET.fromstring(nav_xml)
    results: list[tuple[str, str, int]] = []

    # Find the TOC nav element
    toc_nav = None
    for nav in root.iter():
        tag = nav.tag.split('}', 1)[-1] if '}' in nav.tag else nav.tag
        if tag != 'nav':
            continue
        # Check for epub:type="toc"
        epub_type = nav.get(f'{{{_NS_EPUB}}}type', nav.get('type', ''))
        if epub_type == 'toc':
            toc_nav = nav
            break
    if toc_nav is None:
        # Fallback: first <nav> element
        for nav in root.iter():
            tag = nav.tag.split('}', 1)[-1] if '}' in nav.tag else nav.tag
            if tag == 'nav':
                toc_nav = nav
                break

    if toc_nav is None:
        return results

    def _walk_ol(ol_el, level: int) -> None:
        for child in ol_el:
            tag = child.tag.split('}', 1)[-1] if '}' in child.tag else child.tag
            if tag != 'li':
                continue
            a = None
            for sub in child:
                sub_tag = sub.tag.split('}', 1)[-1] if '}' in sub.tag else sub.tag
                if sub_tag == 'a' or sub_tag == 'span':
                    a = sub
                    break
            if a is not None and a.text:
                href = a.get('href', '').split('#')[0]
                title = a.text.strip()
                if title:
                    results.append((title, href, level))
            # Nested ol
            for sub in child:
                sub_tag = sub.tag.split('}', 1)[-1] if '}' in sub.tag else sub.tag
                if sub_tag == 'ol':
                    _walk_ol(sub, level + 1)

    # Find first <ol> in the nav
    for el in toc_nav.iter():
        tag = el.tag.split('}', 1)[-1] if '}' in el.tag else el.tag
        if tag == 'ol':
            _walk_ol(el, 0)
            break

    return results


# ---------------------------------------------------------------------------
# EPUB image / CSS extraction (stdlib only)
# ---------------------------------------------------------------------------

def _extract_images(
    zf: zipfile.ZipFile,
    manifest: dict[str, dict],
    opf_path: str,
) -> dict[str, str]:
    """Extract images from EPUB and return {zip_path: data_uri} map."""
    image_map: dict[str, str] = {}
    base_dir = posixpath.dirname(opf_path)

    for iid, info in manifest.items():
        mt = info.get('media_type', '')
        href = info.get('href', '')
        if not mt.startswith('image/') and not any(href.endswith(ext) for ext in IMAGE_MIME_MAP):
            continue

        resolved = _resolve_epub_path(opf_path, href)
        try:
            zinfo = zf.getinfo(resolved)
        except KeyError:
            continue

        if zinfo.file_size > MAX_IMAGE_SIZE:
            logger.debug('Skipping large image: %s (%d bytes)', resolved, zinfo.file_size)
            continue

        try:
            data = zf.read(resolved)
        except Exception:
            continue

        # Determine MIME type
        ext = Path(resolved).suffix.lower()
        mime = mt if mt.startswith('image/') else IMAGE_MIME_MAP.get(ext, 'image/png')
        if ext == '.svg' or 'svg' in mime:
            # SVG is text-based, store as-is (not base64)
            svg_text = data.decode('utf-8', errors='replace')
            image_map[resolved] = f'data:{mime};utf8,{html_module.escape(svg_text)}'
        else:
            b64 = base64.b64encode(data).decode('ascii')
            image_map[resolved] = f'data:{mime};base64,{b64}'

    return image_map


def _rewrite_image_sources(html_content: str, image_map: dict[str, str], base_path: str) -> str:
    """Replace relative <img src> with embedded data URIs."""

    def _replace_src(m: re.Match) -> str:
        prefix = m.group(1)
        src = m.group(2)
        suffix = m.group(3)

        # Skip external URLs and data URIs
        if src.startswith(('http://', 'https://', 'data:', '//')):
            return m.group(0)

        # Strip fragment
        clean_src = src.split('#')[0]
        if not clean_src:
            return m.group(0)

        resolved = _resolve_epub_path(base_path, clean_src)
        data_uri = image_map.get(resolved)
        if data_uri:
            return f'{prefix}{data_uri}{suffix}'
        return m.group(0)

    return _IMG_SRC_RE.sub(_replace_src, html_content)


def _extract_epub_css(
    zf: zipfile.ZipFile,
    manifest: dict[str, dict],
    opf_path: str,
) -> str:
    """Extract and concatenate CSS from EPUB manifest."""
    css_parts: list[str] = []
    for iid, info in manifest.items():
        mt = info.get('media_type', '')
        href = info.get('href', '')
        if mt != 'text/css' and not href.endswith('.css'):
            continue
        resolved = _resolve_epub_path(opf_path, href)
        try:
            raw = zf.read(resolved).decode('utf-8', errors='replace')
            css_parts.append(raw)
        except Exception:
            continue

    combined = '\n'.join(css_parts)
    return _sanitize_epub_css(combined)


def _sanitize_epub_css(css: str) -> str:
    """Remove dangerous CSS patterns while keeping safe styles."""
    if not css.strip():
        return ''
    # Remove @font-face blocks
    css = _CSS_FONT_FACE.sub('', css)
    # Remove dangerous patterns line by line
    safe_lines: list[str] = []
    for line in css.split('\n'):
        stripped = line.strip()
        if not stripped:
            continue
        if _CSS_DANGEROUS.search(stripped):
            continue
        if _CSS_POSITION_BAD.search(stripped):
            continue
        # Remove url() references (images already embedded)
        line = _CSS_URL.sub('', line)
        safe_lines.append(line)
    result = '\n'.join(safe_lines).strip()
    return result


# ---------------------------------------------------------------------------
# EPUB cover image extraction
# ---------------------------------------------------------------------------

def _extract_epub_cover(
    zf: zipfile.ZipFile,
    manifest: dict[str, dict],
    opf_data: dict,
    opf_path: str,
) -> str | None:
    """Extract cover image as a data URI."""
    cover_id = opf_data.get('cover_id')
    if not cover_id or cover_id not in manifest:
        return None
    info = manifest[cover_id]
    href = info.get('href', '')
    resolved = _resolve_epub_path(opf_path, href)
    try:
        zinfo = zf.getinfo(resolved)
    except KeyError:
        return None
    if zinfo.file_size > MAX_IMAGE_SIZE:
        return None
    try:
        data = zf.read(resolved)
    except Exception:
        return None
    ext = Path(resolved).suffix.lower()
    mime = IMAGE_MIME_MAP.get(ext, 'image/jpeg')
    b64 = base64.b64encode(data).decode('ascii')
    return f'data:{mime};base64,{b64}'


# ---------------------------------------------------------------------------
# Footnote detection
# ---------------------------------------------------------------------------

_FOOTNOTE_ATTRS = re.compile(
    r'(epub:type\s*=\s*["\']footnote["\']|role\s*=\s*["\']doc-footnote["\']'
    r'|class\s*=\s*["\'][^"\']*footnote[^"\']*["\']'
    r'|class\s*=\s*["\'][^"\']*endnote[^"\']*["\'])',
    re.IGNORECASE,
)
_FOOTNOTE_REF_RE = re.compile(
    r'(<a\s[^>]*href\s*=\s*["\']#(?:fn|footnote|note|endnote)[^"\']*["\'])',
    re.IGNORECASE,
)


def _annotate_footnotes(html_content: str) -> str:
    """Add CSS classes to detected footnote elements and references."""
    # Mark footnote containers
    def _mark_footnote(m: re.Match) -> str:
        tag = m.group(0)
        if 'class="' in tag:
            return tag.replace('class="', 'class="rp-footnote ')
        elif "class='" in tag:
            return tag.replace("class='", "class='rp-footnote ")
        else:
            # Add class before the closing >
            return tag.rstrip('>') + ' class="rp-footnote">'

    # This is a best-effort heuristic — wrap in try/protect
    try:
        html_content = _FOOTNOTE_REF_RE.sub(
            lambda m: m.group(1) + ' class="rp-footnote-ref"',
            html_content,
        )
    except Exception:
        pass
    return html_content


# ---------------------------------------------------------------------------
# EPUB processing — primary (ebooklib) path
# ---------------------------------------------------------------------------

def _epub_toc_to_map(toc, result: dict[str, tuple[str, int]] | None = None, level: int = 0) -> dict[str, tuple[str, int]]:
    """Flatten ebooklib TOC tree into {href: (title, tocLevel)}."""
    if result is None:
        result = {}
    for entry in toc:
        if hasattr(entry, 'href') and hasattr(entry, 'title'):
            href = entry.href.split('#')[0] if entry.href else ''
            title = (entry.title or '').strip()
            if href and title:
                result[href] = (title, level)
        if hasattr(entry, 'children') and entry.children:
            _epub_toc_to_map(entry.children, result, level + 1)
        elif isinstance(entry, (list, tuple)):
            _epub_toc_to_map(entry, result, level)
    return result


def _process_epub_ebooklib(file_path: str) -> dict | None:
    """Process EPUB using ebooklib. Returns None if ebooklib unavailable."""
    try:
        import ebooklib
        from ebooklib import epub
    except ImportError:
        return None

    book = epub.read_epub(file_path)

    # --- TOC map ---
    toc_map: dict[str, tuple[str, int]] = {}
    try:
        toc_map = _epub_toc_to_map(book.toc)
    except Exception as exc:
        logger.debug('EPUB TOC parsing failed: %s', exc)

    # --- Metadata ---
    metadata: dict = {}
    try:
        for field in ('title', 'creator', 'publisher', 'language', 'date'):
            vals = book.get_metadata(_NS_DC, field)
            if vals:
                text = vals[0][0] if vals[0] else ''
                key = 'author' if field == 'creator' else ('year' if field == 'date' else field)
                if key == 'year' and text and len(text) >= 4 and text[:4].isdigit():
                    metadata[key] = int(text[:4])
                elif key != 'year':
                    metadata[key] = text
    except Exception as exc:
        logger.debug('EPUB metadata extraction failed: %s', exc)

    # --- Images ---
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

    # --- CSS ---
    css_str = ''
    try:
        css_parts: list[str] = []
        for item in book.get_items_of_type(ebooklib.ITEM_STYLE):
            css_parts.append(item.get_content().decode('utf-8', errors='replace'))
        css_str = _sanitize_epub_css('\n'.join(css_parts))
    except Exception as exc:
        logger.debug('EPUB CSS extraction failed: %s', exc)

    # --- Spine-ordered chapters ---
    chapters: list[dict] = []
    full_text_parts: list[str] = []

    # Build spine id set for quick lookup
    spine_ids = [s[0] for s in book.spine] if book.spine else []

    # Build item lookup by id
    items_by_id: dict[str, object] = {}
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        items_by_id[item.get_id()] = item

    # Use spine order, fallback to all documents
    ordered_items = []
    if spine_ids:
        for sid in spine_ids:
            if sid in items_by_id:
                ordered_items.append(items_by_id[sid])
    if not ordered_items:
        ordered_items = list(items_by_id.values())

    order = 0
    for item in ordered_items:
        content_bytes = item.get_content()
        raw_html = content_bytes.decode('utf-8', errors='replace') if content_bytes else ''

        # Rewrite images
        item_name = item.get_name()
        try:
            enriched_html = _rewrite_image_sources(raw_html, image_map, item_name)
        except Exception:
            enriched_html = raw_html

        # Annotate footnotes
        enriched_html = _annotate_footnotes(enriched_html)

        # Prepend CSS
        if css_str:
            enriched_html = f'<style>{css_str}</style>\n{enriched_html}'

        # Plain text for RAG
        text = _html_to_structured_text(enriched_html)
        if not text.strip():
            continue

        full_text_parts.append(text)

        # Chapter title from TOC
        title = None
        for href, (t, _lvl) in toc_map.items():
            if href.endswith(item_name) or item_name.endswith(href):
                title = t
                break
        if not title:
            title = _extract_html_title(raw_html) or Path(item_name).stem

        chapters.append({
            'id': item.get_id(),
            'title': title,
            'content': text,
            'rawContent': enriched_html,
            'startIndex': 0,
            'endIndex': len(text),
            'order': order,
            'images': _count_images(enriched_html),
            'wordCount': len(text.split()),
        })
        order += 1

    # --- Cover ---
    cover_uri = None
    try:
        for item in book.get_items_of_type(ebooklib.ITEM_IMAGE):
            if 'cover' in (item.get_id() or '').lower() or 'cover' in (item.get_name() or '').lower():
                data = item.get_content()
                if data and len(data) <= MAX_IMAGE_SIZE:
                    ext = Path(item.get_name()).suffix.lower()
                    mime = IMAGE_MIME_MAP.get(ext, 'image/jpeg')
                    b64 = base64.b64encode(data).decode('ascii')
                    cover_uri = f'data:{mime};base64,{b64}'
                    break
    except Exception:
        pass

    return {
        'total_pages': max(1, len(chapters)),
        'chapters': chapters,
        'content': '\n\n'.join(full_text_parts),
        'metadata': {**metadata, 'cover_data_uri': cover_uri},
    }


# ---------------------------------------------------------------------------
# EPUB processing — zipfile fallback path
# ---------------------------------------------------------------------------

async def _epub_zip_fallback(file_path: str) -> tuple[list[dict], list[str], int]:
    """Process EPUB using zipfile (no ebooklib dependency)."""
    chapters: list[dict] = []
    full_text_parts: list[str] = []
    metadata: dict = {}
    opf_path = ''

    with zipfile.ZipFile(file_path, 'r') as zf:
        # --- Parse EPUB structure ---
        opf_path_raw = None
        opf_data: dict = {}
        toc_entries: list[tuple[str, str, int]] = []
        image_map: dict[str, str] = {}
        css_str = ''

        try:
            opf_path_raw = _parse_epub_container(zf)
        except Exception as exc:
            logger.debug('EPUB container parsing failed: %s', exc)

        if opf_path_raw:
            opf_path = opf_path_raw
            try:
                opf_xml = zf.read(opf_path).decode('utf-8', errors='replace')
                opf_data = _parse_opf(opf_xml, opf_path)
                metadata = opf_data.get('metadata', {})
            except Exception as exc:
                logger.debug('OPF parsing failed: %s', exc)

        # --- Parse TOC ---
        toc_map: dict[str, tuple[str, int]] = {}
        if opf_data:
            try:
                ncx_href = opf_data.get('ncx_href')
                if ncx_href:
                    ncx_path = _resolve_epub_path(opf_path, ncx_href)
                    ncx_xml = zf.read(ncx_path).decode('utf-8', errors='replace')
                    toc_entries = _parse_ncx(ncx_xml)
            except Exception as exc:
                logger.debug('NCX parsing failed: %s', exc)

            try:
                nav_href = opf_data.get('nav_href')
                if nav_href and not toc_entries:
                    nav_path = _resolve_epub_path(opf_path, nav_href)
                    nav_xml = zf.read(nav_path).decode('utf-8', errors='replace')
                    toc_entries = _parse_nav(nav_xml)
            except Exception as exc:
                logger.debug('Nav parsing failed: %s', exc)

            # Build href → (title, level) map
            for title, href, level in toc_entries:
                if href:
                    resolved = _resolve_epub_path(opf_path, href)
                    toc_map[resolved] = (title, level)

        # --- Extract images ---
        if opf_data:
            try:
                image_map = _extract_images(zf, opf_data.get('manifest', {}), opf_path)
            except Exception as exc:
                logger.debug('Image extraction failed: %s', exc)

        # --- Extract CSS ---
        if opf_data:
            try:
                css_str = _extract_epub_css(zf, opf_data.get('manifest', {}), opf_path)
            except Exception as exc:
                logger.debug('CSS extraction failed: %s', exc)

        # --- Build chapters in spine order ---
        manifest = opf_data.get('manifest', {})
        spine = opf_data.get('spine', [])

        # Resolve spine idrefs to hrefs
        spine_hrefs: list[tuple[str, str]] = []
        for idref in spine:
            info = manifest.get(idref)
            if not info:
                continue
            href = info.get('href', '')
            mt = info.get('media_type', '')
            # Only include HTML/XHTML documents
            if mt and not mt.startswith(('application/xhtml', 'text/html')):
                if not href.endswith(('.html', '.xhtml', '.htm')):
                    continue
            spine_hrefs.append((idref, href))

        # Fallback to alphabetical HTML files if no spine
        if not spine_hrefs:
            html_files = sorted(
                n for n in zf.namelist()
                if n.endswith(('.html', '.xhtml', '.htm'))
            )
            spine_hrefs = [(f'fallback-{i}', h) for i, h in enumerate(html_files)]

        order = 0
        for item_id, href in spine_hrefs:
            resolved = _resolve_epub_path(opf_path, href)
            try:
                raw_html = zf.read(resolved).decode('utf-8', errors='replace')
            except (KeyError, Exception):
                continue

            # Rewrite images
            try:
                enriched_html = _rewrite_image_sources(raw_html, image_map, resolved)
            except Exception:
                enriched_html = raw_html

            # Annotate footnotes
            enriched_html = _annotate_footnotes(enriched_html)

            # Prepend CSS
            if css_str:
                enriched_html = f'<style>{css_str}</style>\n{enriched_html}'

            # Plain text
            text = _html_to_structured_text(enriched_html)
            if not text.strip() or len(text.strip()) < 20:
                continue

            full_text_parts.append(text)

            # Title from TOC → <title> → filename
            title = None
            toc_entry = toc_map.get(resolved)
            if toc_entry:
                title = toc_entry[0]
            if not title:
                title = _extract_html_title(raw_html) or Path(resolved).stem.replace('-', ' ').title()

            chapters.append({
                'id': item_id,
                'title': title,
                'content': text,
                'rawContent': enriched_html,
                'startIndex': 0,
                'endIndex': len(text),
                'order': order,
                'images': _count_images(enriched_html),
                'wordCount': len(text.split()),
            })
            order += 1

        # --- Cover ---
        cover_uri = None
        if opf_data:
            try:
                cover_uri = _extract_epub_cover(zf, manifest, opf_data, opf_path)
            except Exception:
                pass

    # Attach metadata via a side-channel
    _last_epub_metadata = {**metadata, 'cover_data_uri': cover_uri}
    return chapters, full_text_parts, max(1, len(chapters))


# Module-level temp for zipfile fallback metadata
_last_epub_metadata: dict = {}


# ---------------------------------------------------------------------------
# EPUB processing — orchestrator
# ---------------------------------------------------------------------------

async def process_epub(file_path: str) -> dict:
    """Extract text, images, TOC, and metadata from EPUB."""
    # Try ebooklib first
    result = _process_epub_ebooklib(file_path)
    if result is not None:
        return result

    # Fallback to zipfile
    logger.warning('ebooklib not available, using ZIP fallback for EPUB')
    global _last_epub_metadata
    _last_epub_metadata = {}
    chapters, full_text_parts, total_pages = await _epub_zip_fallback(file_path)
    return {
        'total_pages': total_pages,
        'chapters': chapters,
        'content': '\n\n'.join(full_text_parts),
        'metadata': _last_epub_metadata,
    }


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
                except Exception:
                    pass
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
        text = _fix_garbled_cjk(text)
        pages_text.append(text.strip())
        pages_html.append(_text_to_html_paragraphs(text.strip()))

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
    await db.commit()
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
        from app.services.rag_service import precompute_book_embeddings
        await precompute_book_embeddings(book_id, document_id, chapters)
    except Exception as exc:
        logger.error(
            'Background embedding pre-computation failed for book %s: %s',
            book_id, exc,
        )
