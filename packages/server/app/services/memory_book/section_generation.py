"""Section generation for Reading Mirror — LLM-powered section creation."""

from __future__ import annotations

import json
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

    book_title = enriched_data.get('book', {}).get('title', 'Unknown')
    book_author = enriched_data.get('book', {}).get('author', 'Unknown')

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
    )
    if isinstance(result, dict):
        return result
    return fallback


def _placeholder_section(section_type: str) -> dict[str, Any]:
    """Return a placeholder section for Phase 2 sections."""
    section_names: dict[str, str] = {}
    return {
        'type': section_type,
        'title': section_names.get(section_type, section_type),
        'placeholder': True,
        'message': t('memory_book.placeholder_message'),
    }
