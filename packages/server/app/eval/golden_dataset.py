"""Golden test dataset for LLM prompt evaluation.

Re-exports from submodules for backward compatibility.
"""

from __future__ import annotations

from typing import Any

from app.eval.golden_companion import (
    COMPANION_CHAT,
    COMPANION_CHAT_INJECTION,
    COMPANION_EXPLAIN,
    COMPANION_SUMMARIZE,
    FRIEND_CHAT,
    FRIEND_CHAT_INJECTION,
)
from app.eval.golden_services import (
    CONVERSATION_SUMMARY,
    CONVERSATION_SUMMARY_WITH_PRIOR,
    CROSS_BOOK_SYNTHESIS,
    KNOWLEDGE_EXTRACTION,
    MEMORY_BOOK_COVER,
    MEMORY_BOOK_JOURNEY,
    READING_PLAN,
    RESEARCH_BRIEF,
    SINGLE_BOOK_SYNTHESIS,
    STUDY_CONCEPT_CHECKS,
    STUDY_OBJECTIVES,
)

# ---------------------------------------------------------------------------
# Full registry — all golden test cases
# ---------------------------------------------------------------------------

ALL_GOLDEN: list[dict[str, Any]] = [
    COMPANION_CHAT,
    COMPANION_CHAT_INJECTION,
    COMPANION_SUMMARIZE,
    COMPANION_EXPLAIN,
    FRIEND_CHAT,
    FRIEND_CHAT_INJECTION,
    STUDY_OBJECTIVES,
    STUDY_CONCEPT_CHECKS,
    KNOWLEDGE_EXTRACTION,
    SINGLE_BOOK_SYNTHESIS,
    CROSS_BOOK_SYNTHESIS,
    MEMORY_BOOK_COVER,
    MEMORY_BOOK_JOURNEY,
    READING_PLAN,
    CONVERSATION_SUMMARY,
    CONVERSATION_SUMMARY_WITH_PRIOR,
    RESEARCH_BRIEF,
]
