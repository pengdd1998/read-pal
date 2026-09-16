"""Document parsers — EPUB (stdlib zipfile) and PDF.

Public API: ``process_epub`` / ``process_pdf`` (and the shared
``_html_clean`` helpers used by tests).
"""

from app.services.parsers.epub import process_epub
from app.services.parsers.pdf import process_pdf

__all__ = ['process_epub', 'process_pdf']
