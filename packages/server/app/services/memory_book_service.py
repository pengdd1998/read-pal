"""Reading Mirror service — thin re-export layer.

All implementation lives in app.services.memory_book sub-package.
This module re-exports the public API for backward compatibility.
"""

from app.services.memory_book.data_collection import (  # noqa: F401
    _collect_book_data,
    _collect_enriched_data,
)
from app.services.memory_book.renderer import _render_html, _render_chapter_html, _esc  # noqa: F401
from app.services.memory_book.section_generation import (  # noqa: F401
    SECTION_TYPES,
    SECTION_SCHEMAS,
    _generate_section,
    _placeholder_section,
)
from app.services.memory_book.pipeline import generate  # noqa: F401

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
