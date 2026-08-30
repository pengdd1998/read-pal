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
from contextvars import ContextVar

from app.services.epub_parser.ebooklib_path import process_epub_ebooklib
from app.services.epub_parser.zipfile_path import epub_zip_fallback

logger = logging.getLogger('read-pal')

# Context-local metadata for zipfile fallback (concurrency-safe)
_epub_metadata_var: ContextVar[dict] = ContextVar('_epub_metadata_var', default={})


def _set_metadata(metadata: dict) -> None:
    _epub_metadata_var.set(metadata)


async def process_epub(file_path: str) -> dict:
    """Extract text, images, TOC, and metadata from EPUB.

    Raises ValueError for files that are not parseable EPUBs (truncated
    archive, a PDF renamed to .epub, …) so the global handler returns a
    400 instead of an opaque 500 (UPLD-10 in the E2E plan).
    """
    import zipfile as _zipfile

    try:
        # Try ebooklib first
        result = process_epub_ebooklib(file_path)
    except (_zipfile.BadZipFile, KeyError, OSError, ValueError):
        raise ValueError('The file is not a valid EPUB (unreadable archive)') from None
    if result is not None:
        return result

    # Fallback to zipfile
    logger.warning('ebooklib not available, using ZIP fallback for EPUB')
    _epub_metadata_var.set({})
    try:
        chapters, full_text_parts, total_pages = await epub_zip_fallback(file_path)
    except (_zipfile.BadZipFile, KeyError, OSError, ValueError):
        raise ValueError('The file is not a valid EPUB (unreadable archive)') from None
    return {
        'total_pages': total_pages,
        'chapters': chapters,
        'content': '\n\n'.join(full_text_parts),
        'metadata': _epub_metadata_var.get({}),
    }
