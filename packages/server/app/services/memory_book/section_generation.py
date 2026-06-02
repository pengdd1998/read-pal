"""Section generation for Reading Mirror — LLM-powered section creation."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage

from app.prompts import MIRROR_SECTIONS, MIRROR_SYSTEM
from app.schemas.llm_outputs import (
    EncounterData,
    GroundedRecommendationData,
    HighlightClusterData,
)
from app.services.llm import safe_llm_invoke
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
    # conversations and annotations_woven use raw JSON (no schema validation)
}


def _prepare_section_data(
    section_type: str,
    enriched_data: dict[str, Any],
    budget: TokenBudget,
) -> dict[str, Any]:
    """Prepare the data payload for a specific section type."""
    if section_type == 'encounter':
        sessions = enriched_data.get('reading_sessions', [])
        total_min = enriched_data.get('stats', {}).get('total_reading_minutes', 0)
        hours = total_min // 60
        mins = total_min % 60
        longest = enriched_data.get('longest_session_minutes', 0)
        lh = int(longest) // 60
        lm = int(longest) % 60
        return {
            'total_time': f'{hours}h {mins}m' if hours > 0 else f'{mins}m',
            'session_count': len(sessions),
            'first_date': enriched_data.get('first_session_date', 'unknown'),
            'last_date': enriched_data.get('last_session_date', 'unknown'),
            'first_highlight': enriched_data.get('first_highlight', ''),
            'concept_list': ', '.join(enriched_data.get('concepts', [])[:10]),
            'mastery_score': enriched_data.get('mastery', {}).get('overallMastery', 0),
            'highlight_count': enriched_data.get('stats', {}).get('total_highlights', 0),
            'longest_session': f'{lh}h {lm}m' if lh > 0 else f'{lm}m',
        }

    elif section_type == 'highlights':
        raw_highlights = enriched_data.get('highlights', [])[:30]
        budgeted = _budget_list(raw_highlights, budget, 'highlights')
        return {
            'count': len(enriched_data.get('highlights', [])),
            'book_title': enriched_data.get('book', {}).get('title', ''),
            'concept_list': ', '.join(enriched_data.get('concepts', [])[:10]),
            'theme_list': ', '.join(enriched_data.get('synthesis_themes', [])[:5]),
            'highlights': budgeted,
        }

    elif section_type == 'recommendations':
        return {
            'book_title': enriched_data.get('book', {}).get('title', ''),
            'top_themes': ', '.join(enriched_data.get('synthesis_themes', [])[:5]),
            'concept_list': ', '.join(enriched_data.get('concepts', [])[:10]),
            'existing_books': ', '.join(enriched_data.get('existing_books', [])[:15]),
        }

    elif section_type == 'conversations':
        chats = enriched_data.get('conversations', [])
        excerpts: list[str] = []
        for msg in chats[:15]:
            role = msg.get('role', '')
            content = msg.get('content', '')[:150]
            if role == 'user' and content:
                excerpts.append(f'Reader asked: "{content}"')
            elif role == 'assistant' and content:
                excerpts.append(f'AI replied: "{content}"')
        return {
            'book_title': enriched_data.get('book', {}).get('title', ''),
            'chat_count': len(chats),
            'chat_excerpts': '\n'.join(excerpts[:12]),
        }

    elif section_type == 'annotations_woven':
        notes = enriched_data.get('notes', [])
        notes_text = '\n'.join(
            f'- "{n.get("note", n.get("content", ""))[:150]}"'
            for n in notes[:15]
            if n.get('note') or n.get('content')
        )
        return {
            'book_title': enriched_data.get('book', {}).get('title', ''),
            'note_count': len(notes),
            'notes_data': notes_text,
        }

    return {}


def _budget_list(
    items: list[dict[str, Any]],
    budget: TokenBudget,
    label: str,
) -> list[dict[str, Any]]:
    """Trim a list of dicts to fit within the token budget."""
    result: list[dict[str, Any]] = []
    for item in items:
        text = json.dumps(item, default=str)
        if budget.check_fits(text):
            budget.add(text, label=f'{label}[{len(result)}]')
            result.append(item)
        else:
            break
    return result


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
    section_data = _prepare_section_data(section_type, enriched_data, budget)

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
    section_names = {
        'attention_map': 'Map of Your Attention',
        'concept_web': 'Your Concept Web',
        'what_stuck': 'What Stuck',
        'threads': 'Threads Between Books',
        'reader_became': 'The Reader You Became',
    }
    return {
        'type': section_type,
        'title': section_names.get(section_type, section_type),
        'placeholder': True,
        'message': 'This section will be available in a future update.',
    }
