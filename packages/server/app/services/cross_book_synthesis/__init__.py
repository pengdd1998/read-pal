"""Cross-book synthesis sub-package — multi-book analysis and comparison.

Public API re-exported here for convenient imports.
"""

from app.services.cross_book_synthesis.queries import (
  batch_collect_reading_data,
  get_user_book_ids,
)
from app.services.cross_book_synthesis.llm import (
  run_comparison_llm,
  run_synthesis_llm,
)
from app.services.cross_book_synthesis.builders import (
  assemble_book_data,
  build_book_meta,
  build_conversations,
  build_highlights,
  build_notes,
  build_reading_sessions,
  condense_book,
  condense_book_data,
)

__all__ = [
  'batch_collect_reading_data',
  'build_book_meta',
  'build_conversations',
  'build_highlights',
  'build_notes',
  'build_reading_sessions',
  'assemble_book_data',
  'condense_book',
  'condense_book_data',
  'get_user_book_ids',
  'run_comparison_llm',
  'run_synthesis_llm',
]
