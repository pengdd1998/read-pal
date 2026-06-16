"""Section generation for Reading Mirror — LLM-powered section creation."""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage

from app.prompts import MIRROR_SECTIONS, MIRROR_SYSTEM
from app.schemas.llm_outputs import (
    AttentionMapData,
    AnnotationsWovenData,
    ConceptWebData,
    EncounterData,
    GroundedRecommendationData,
    HighlightClusterData,
    MirrorConversationsData,
    ReaderBecameData,
    ThreadsData,
    WhatStuckData,
)
from app.services.llm import safe_llm_invoke
from app.services.memory_book.section_data_dispatch import prepare_section_data
from app.utils.i18n import t
from app.utils.sanitizer import sanitize_user_input
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.memory_book')

# Section type constants
SECTION_TYPES = [
    'encounter',          # 1: Second-person prologue
    'attention_map',      # 2: Engagement heatmap (Phase 2)
    'highlights',         # 3: Themed highlight clusters
    'annotations_woven',  # 4: Thinking arc (Phase 2)
    'conversations',      # 5: Breakthrough moments (Phase 2)
    'concept_web',        # 6: Knowledge graph (Phase 2)
    'what_stuck',         # 7: Flashcard retention (Phase 2)
    'threads',            # 8: Cross-book connections (Phase 2)
    'reader_became',      # 9: Reflective essay (Phase 2)
    'recommendations',    # 10: Grounded recommendations
]

# Maps section type -> Pydantic schema for LLM validation
SECTION_SCHEMAS: dict[str, type] = {
    'encounter': EncounterData,
    'highlights': HighlightClusterData,
    'recommendations': GroundedRecommendationData,
    'attention_map': AttentionMapData,
    'what_stuck': WhatStuckData,
    'concept_web': ConceptWebData,
    'threads': ThreadsData,
    'reader_became': ReaderBecameData,
    'annotations_woven': AnnotationsWovenData,
    'conversations': MirrorConversationsData,
}

async def _generate_section(
    section_type: str,
    enriched_data: dict[str, Any],
    user_id: UUID | None = None,
    book_id: UUID | None = None,
) -> dict[str, Any]:
    """Generate a single Reading Mirror section via LLM."""
    section_template = MIRROR_SECTIONS.get(section_type)
    if section_template is None:
        return _placeholder_section(section_type)

    book_title = sanitize_user_input(
        enriched_data.get('book', {}).get('title', 'Unknown'),
        context='mirror_book_title',
    ) or 'Unknown'
    book_author = sanitize_user_input(
        enriched_data.get('book', {}).get('author', 'Unknown'),
        context='mirror_book_author',
    ) or 'Unknown'

    budget = TokenBudget(model='glm-4.7-flash', response_reserve=4_000)
    section_data = prepare_section_data(section_type, enriched_data, budget)

    system_prompt = MIRROR_SYSTEM.template.format(
        book_title=book_title,
        book_author=book_author,
        section_prompt=section_template.template,
    )

    human_prompt = json.dumps(section_data, default=str)
    if budget.truncations:
        logger.info(
            'section_budget_truncations',
            section_type=section_type,
            truncations=', '.join(budget.truncations),
        )

    fallback = {
        'type': section_type,
        'error': 'AI generation temporarily unavailable. Try regenerating later.',
    }
    result = await safe_llm_invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ],
        fallback=fallback,
        log_label=f'Reading Mirror section {section_type}',
        schema_class=SECTION_SCHEMAS.get(section_type),
        user_id=str(user_id) if user_id else None,
        book_id=str(book_id) if book_id else None,
        template=section_template,
    )
    if isinstance(result, dict):
        return result
    return fallback


# P2.4: Best-of-N for the high-stakes closing essay. reader_became is the
# most prominent section in the Memory Book and runs once per book
# completion, so 3x cost is acceptable for the variance reduction.
# Approach follows the prompt-review skill's recommendation: run N times,
# compare key fields, flag divergence as a hallucination signal.
_READER_BECAME_N = 3
# Jaccard similarity threshold below which we log a divergence warning.
# 0.3 means the runs share fewer than ~30% of content words in their
# key_transformation field — a strong signal the prompt is underspecified
# for this user's data and the LLM is reaching for different framings.
_DIVERGENCE_WARN_THRESHOLD = 0.3
# Common English stop words skipped when computing word overlap so the
# similarity score reflects content rather than syntax glue.
_STOP_WORDS = frozenset(
    'a an the and or but if while of to in on at by for with from into '
    'over under about your you they them their this that these those it '
    'is are was were be been being have has had do does did will would '
    'can could should may might must as not no'.split(),
)


def _content_words(text: str) -> set[str]:
    """Lowercase alphanumeric tokens with stop words removed."""
    tokens = re.findall(r'[a-zA-Z0-9]+', (text or '').lower())
    return {t for t in tokens if t not in _STOP_WORDS and len(t) > 2}


def _jaccard(a: set[str], b: set[str]) -> float:
    """Jaccard similarity between two token sets; 0 if both empty."""
    if not a and not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


async def _generate_reader_became_best_of_n(
    enriched_data: dict[str, Any],
    user_id: UUID | None = None,
    book_id: UUID | None = None,
) -> dict[str, Any]:
    """Generate reader_became N times in parallel; flag divergence.

    Returns the first valid result for determinism. Logs a warning when
    the parallel runs diverge on ``key_transformation`` (low word overlap),
    which is the prompt-review skill's recommended hallucination signal
    for high-stakes conclusions.

    Falls back to an error stub only if all N attempts fail — the standard
    ``safe_llm_invoke`` repair ladder already handles schema/JSON failures
    within a single attempt, so an all-N failure is a real regression
    worth flagging.
    """
    attempts = await asyncio.gather(
        *[
            _generate_section(
                'reader_became', enriched_data,
                user_id=user_id, book_id=book_id,
            )
            for _ in range(_READER_BECAME_N)
        ],
        return_exceptions=True,
    )

    valid: list[dict[str, Any]] = []
    for attempt in attempts:
        if isinstance(attempt, dict) and not attempt.get('error'):
            valid.append(attempt)

    if not valid:
        logger.warning(
            'reader_became_best_of_n_all_failed',
            user_id=str(user_id) if user_id else None,
            book_id=str(book_id) if book_id else None,
            attempts=_READER_BECAME_N,
        )
        return {
            'type': 'reader_became',
            'error': 'AI generation temporarily unavailable. Try regenerating later.',
        }

    # P2.4: consistency check. Compute pairwise Jaccard on
    # key_transformation content words across all valid runs. Mean overlap
    # below threshold ⇒ log warning (does not gate output).
    if len(valid) >= 2:
        token_sets = [
            _content_words(str(v.get('key_transformation', ''))) for v in valid
        ]
        pair_scores: list[float] = []
        for i in range(len(token_sets)):
            for j in range(i + 1, len(token_sets)):
                pair_scores.append(_jaccard(token_sets[i], token_sets[j]))
        mean_overlap = sum(pair_scores) / len(pair_scores) if pair_scores else 1.0
        if mean_overlap < _DIVERGENCE_WARN_THRESHOLD:
            logger.warning(
                'reader_became_best_of_n_divergent',
                user_id=str(user_id) if user_id else None,
                book_id=str(book_id) if book_id else None,
                mean_overlap=round(mean_overlap, 3),
                transformations=[str(v.get('key_transformation', '')) for v in valid],
            )

    return valid[0]


def _placeholder_section(section_type: str) -> dict[str, Any]:
    """Return a placeholder section for unknown section types.

    Reached only if a future SECTION_TYPES entry is added without a matching
    MIRROR_SECTIONS template — defensive safety net.
    """
    return {
        'type': section_type,
        'title': section_type,
        'placeholder': True,
        'message': t('memory_book.placeholder_message'),
    }
