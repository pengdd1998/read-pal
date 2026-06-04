"""Small HTML helper functions for EPUB content processing."""

import html as html_module
import posixpath

from app.services.epub_parser.constants import IMG_COUNT_RE, TITLE_RE


def resolve_epub_path(base: str, href: str) -> str:
    """Resolve a relative href against an OPF base path within an EPUB ZIP."""
    base_dir = posixpath.dirname(base)
    resolved = posixpath.normpath(posixpath.join(base_dir, href))
    # Strip leading ./ or ../ artifacts
    while resolved.startswith('../'):
        resolved = resolved[3:]
    return resolved


def extract_html_title(html_content: str) -> str | None:
    """Extract <title> text from HTML content."""
    m = TITLE_RE.search(html_content)
    if m:
        title = html_module.unescape(m.group(1)).strip()
        if title:
            return title
    return None


def count_images(html: str) -> int:
    """Count <img> elements in HTML."""
    return len(IMG_COUNT_RE.findall(html))
