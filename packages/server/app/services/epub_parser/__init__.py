"""EPUB parsing and content extraction service.

Public API: process_epub(file_path) -> dict

Decomposed into focused sub-modules:
- constants: shared constants and regex patterns
- html_helpers: path resolution, title extraction
- structural: OPF/NCX/NAV parsing
- images: image extraction and source rewriting
- css: CSS extraction and sanitization
- footnotes: footnote annotation
- ebooklib_path: primary processing via ebooklib
- zipfile_path: fallback processing via zipfile
"""

import logging

from app.services.epub_parser.ebooklib_path import process_epub_ebooklib
from app.services.epub_parser.zipfile_path import epub_zip_fallback

logger = logging.getLogger('read-pal')

# Module-level temp for zipfile fallback metadata
_last_epub_metadata: dict = {}


async def process_epub(file_path: str) -> dict:
    """Extract text, images, TOC, and metadata from EPUB."""
    # Try ebooklib first
    result = process_epub_ebooklib(file_path)
    if result is not None:
        return result

    # Fallback to zipfile
    logger.warning('ebooklib not available, using ZIP fallback for EPUB')
    global _last_epub_metadata
    _last_epub_metadata = {}
    chapters, full_text_parts, total_pages = await epub_zip_fallback(file_path)
    return {
        'total_pages': total_pages,
        'chapters': chapters,
        'content': '\n\n'.join(full_text_parts),
        'metadata': _last_epub_metadata,
    }
