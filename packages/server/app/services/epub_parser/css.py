"""CSS extraction and sanitization for EPUB files."""

import logging
import zipfile

logger = logging.getLogger('read-pal')

from app.services.epub_parser.constants import (
    CSS_DANGEROUS,
    CSS_FONT_FACE,
    CSS_POSITION_BAD,
    CSS_URL,
)
from app.services.epub_parser.html_helpers import resolve_epub_path


def extract_epub_css(
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
        resolved = resolve_epub_path(opf_path, href)
        try:
            raw = zf.read(resolved).decode('utf-8', errors='replace')
            css_parts.append(raw)
        except Exception as exc:
            logger.debug('Failed to read CSS from ZIP: %s', resolved, exc_info=True)
            continue

    combined = '\n'.join(css_parts)
    return sanitize_epub_css(combined)


def sanitize_epub_css(css: str) -> str:
    """Remove dangerous CSS patterns while keeping safe styles."""
    if not css.strip():
        return ''
    # Remove @font-face blocks
    css = CSS_FONT_FACE.sub('', css)
    # Remove dangerous patterns line by line
    safe_lines: list[str] = []
    for line in css.split('\n'):
        stripped = line.strip()
        if not stripped:
            continue
        if CSS_DANGEROUS.search(stripped):
            continue
        if CSS_POSITION_BAD.search(stripped):
            continue
        # Remove url() references (images already embedded)
        line = CSS_URL.sub('', line)
        safe_lines.append(line)
    return '\n'.join(safe_lines).strip()
