"""Reading Mirror service — thin re-export layer.

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

# Re-export safe_llm_invoke for test mocking compatibility
from app.services.llm import safe_llm_invoke

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
    'safe_llm_invoke',
]
