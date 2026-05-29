"""Reading Mirror (Memory Book) — thin re-export layer.

All implementation lives in app.services.memory_book sub-package.
This module re-exports the public API for backward compatibility.
"""

from app.services.memory_book.data_collection import (
    _collect_book_data,
    _collect_enriched_data,
)
from app.services.memory_book.renderer import _render_html, _render_chapter_html, _esc
from app.services.memory_book.section_generation import (
    SECTION_TYPES,
    SECTION_SCHEMAS,
    _generate_section,
    _placeholder_section,
)
from app.services.memory_book.pipeline import generate

__all__ = [
    'generate',
    '_collect_book_data',
    '_collect_enriched_data',
    '_render_html',
    '_render_chapter_html',
    '_esc',
    'SECTION_TYPES',
    'SECTION_SCHEMAS',
    '_generate_section',
    '_placeholder_section',
]
