"""EPUB parsing and content extraction service.

Public API: process_epub(file_path) -> dict

Decomposed into focused sub-modules:
- constants: shared constants and regex patterns
- html_helpers: path resolution, title extraction
- structural: OPF/NCX/NAV parsing
- images: image extraction and source rewriting
- css: CSS extraction and sanitization
- footnotes: footnote annotation
- zipfile_path: fallback processing via zipfile
"""

import logging
from contextvars import ContextVar

from app.services.parsers.epub.zipfile_path import epub_zip_fallback

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

    # Single parse path: zipfile (M3.4). The ebooklib variant was retired —
    # ebooklib is blocked on Python 3.13 (lxml) and the prod image never
    # installed it, so the "primary" path was dead code with its own bug
    # class (the module-level footnote global fixed 2026-09-16).
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
