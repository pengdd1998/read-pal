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
    COACH_ASSESS,
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
    SYNTHESIS_CONCEPT_MAP,
    SYNTHESIS_CONTRADICTIONS,
    SYNTHESIS_CROSS_REFERENCE,
    SYNTHESIS_SUMMARY_REPORT,
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
    COACH_ASSESS,
    SYNTHESIS_CROSS_REFERENCE,
    SYNTHESIS_CONCEPT_MAP,
    SYNTHESIS_CONTRADICTIONS,
    SYNTHESIS_SUMMARY_REPORT,
]

# ---------------------------------------------------------------------------
# Guards annotation (engineering-upgrade B3)
# ---------------------------------------------------------------------------

# Every golden entry must answer "which regression class does this guard
# against?" — an entry that can't say what it protects is un-auditable when
# the set grows or a case is retired. Vocabulary:
#   format    — output shape/length/wording contract (wrapping, truncation)
#   schema    — structured-output key/type contract (JSON parse + fields)
#   injection — sanitization/anti-injection contract (untrusted text stays data)
#   sanitizer — input-wrapping / adversarial-input handling
#   budget    — token accounting / estimation
# Values may combine ("schema+format"). New entries should set ``guards``
# inline in their dict; the mapping below covers the pre-annotation set.
_GUARDS_BY_KEY: dict[str, str] = {
    'companion/chat': 'format',
    'companion/chat_injection': 'injection',
    'companion/summarize': 'format',
    'companion/explain': 'format',
    'friend/chat': 'format',
    'friend/chat_injection': 'injection',
    'study_mode/generate_objectives': 'schema',
    'study_mode/generate_concept_checks': 'schema',
    'knowledge/extract_concepts': 'schema',
    'synthesis/synthesize': 'schema',
    'synthesis/cross_book': 'schema',
    'memory_book/chapter_1_cover': 'schema',
    'memory_book/chapter_2_journey': 'schema',
    'reading_plan/generate': 'schema+format',
    'conversation_memory/summarize': 'schema',
    'conversation_memory/summarize_with_prior': 'schema',
    'research_agent/synthesize': 'schema',
    'coach_agent/assess': 'schema',
    'synthesis/cross_reference': 'schema',
    'synthesis/concept_map': 'schema',
    'synthesis/contradictions': 'schema',
    'synthesis/summary_report': 'schema',
}

for _golden in ALL_GOLDEN:
    _golden.setdefault(
        'guards',
        _GUARDS_BY_KEY.get(f"{_golden['service']}/{_golden['action']}", ''),
    )
del _golden
