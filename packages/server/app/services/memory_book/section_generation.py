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


def _format_duration(total_minutes: int) -> str:
    """Format minutes into human-readable duration string."""
    hours = total_minutes // 60
    mins = total_minutes % 60
    return f'{hours}h {mins}m' if hours > 0 else f'{mins}m'


def _prepare_session_section(
    section_type: str,
    enriched_data: dict[str, Any],
) -> dict[str, Any]:
    """Prepare data for encounter and attention_map sections."""
    sessions = enriched_data.get('reading_sessions', [])
    stats = enriched_data.get('stats', {})
    total_min = stats.get('total_reading_minutes', 0)
    longest = enriched_data.get('longest_session_minutes', 0)

    if section_type == 'encounter':
        return {
            'total_time': _format_duration(total_min),
            'session_count': len(sessions),
            'first_date': enriched_data.get('first_session_date', 'unknown'),
            'last_date': enriched_data.get('last_session_date', 'unknown'),
            'first_highlight': enriched_data.get('first_highlight', ''),
            'concept_list': ', '.join(enriched_data.get('concepts', [])[:10]),
            'mastery_score': enriched_data.get('mastery', {}).get('overallMastery', 0),
            'highlight_count': stats.get('total_highlights', 0),
            'longest_session': _format_duration(int(longest)),
        }

    # attention_map
    session_lines: list[str] = []
    reading_days: set[str] = set()
    for s in sessions[:20]:
        started = s.get('started_at', '')[:10]
        dur = round(s.get('duration', 0) / 60, 1)
        pages = s.get('pages_read', 0)
        hl = s.get('highlights', 0)
        nt = s.get('notes', 0)
        reading_days.add(started)
        session_lines.append(f'{started}: {dur}min, {pages}pg, {hl}hl, {nt}notes')
    return {
        'book_title': enriched_data.get('book', {}).get('title', ''),
        'session_count': len(sessions),
        'reading_days': len(reading_days),
        'total_time': _format_duration(total_min),
        'session_data': '\n'.join(session_lines),
        'pace': enriched_data.get('reading_pace', 0),
        'longest_session': _format_duration(int(longest)),
    }


def _prepare_annotation_section(
    section_type: str,
    enriched_data: dict[str, Any],
    budget: TokenBudget,
) -> dict[str, Any]:
    """Prepare data for highlights, annotations_woven, and conversations sections."""
    book_title = enriched_data.get('book', {}).get('title', '')

    if section_type == 'highlights':
        raw_highlights = enriched_data.get('highlights', [])[:30]
        budgeted = _budget_list(raw_highlights, budget, 'highlights')
        return {
            'count': len(enriched_data.get('highlights', [])),
            'book_title': book_title,
            'concept_list': ', '.join(enriched_data.get('concepts', [])[:10]),
            'theme_list': ', '.join(enriched_data.get('synthesis_themes', [])[:5]),
            'highlights': budgeted,
        }

    if section_type == 'conversations':
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
            'book_title': book_title,
            'chat_count': len(chats),
            'chat_excerpts': '\n'.join(excerpts[:12]),
        }

    # annotations_woven
    notes = enriched_data.get('notes', [])
    notes_text = '\n'.join(
        f'- "{n.get("note", n.get("content", ""))[:150]}"'
        for n in notes[:15]
        if n.get('note') or n.get('content')
    )
    return {
        'book_title': book_title,
        'note_count': len(notes),
        'notes_data': notes_text,
    }


def _prepare_knowledge_section(
    section_type: str,
    enriched_data: dict[str, Any],
) -> dict[str, Any]:
    """Prepare data for concept_web, threads, and what_stuck sections."""
    book_title = enriched_data.get('book', {}).get('title', '')

    if section_type == 'what_stuck':
        flashcards = enriched_data.get('flashcards', [])
        fc_lines = [
            f'Q: "{fc.get("question", "")[:100]}" | '
            f'rating: {fc.get("last_rating", 0)}/5 | '
            f'reviews: {fc.get("repetition_count", 0)}'
            for fc in flashcards[:15]
        ]
        mastery = enriched_data.get('mastery', {})
        return {
            'book_title': book_title,
            'flashcard_count': len(flashcards),
            'flashcard_data': '\n'.join(fc_lines),
            'mastery_score': mastery.get('overallMastery', 0),
            'strong_areas': ', '.join(mastery.get('strongAreas', [])[:5]),
            'weak_areas': ', '.join(mastery.get('weakAreas', [])[:5]),
        }

    if section_type == 'concept_web':
        concepts = enriched_data.get('concepts', [])
        edges = enriched_data.get('concept_edges', [])
        edge_lines = [
            f'{e["source"]} → {e["target"]} ({e["label"]})'
            for e in edges[:20] if e.get('label')
        ]
        return {
            'book_title': book_title,
            'concept_count': len(concepts),
            'concept_list': ', '.join(concepts[:15]),
            'edge_descriptions': '\n'.join(edge_lines) if edge_lines else 'No explicit connections found',
            'theme_list': ', '.join(enriched_data.get('synthesis_themes', [])[:5]),
        }

    # threads
    other_books = enriched_data.get('other_books', [])
    book_list = ', '.join(f'"{b["title"]}" by {b["author"]}' for b in other_books[:10])
    return {
        'book_title': book_title,
        'theme_list': ', '.join(enriched_data.get('synthesis_themes', [])[:5]),
        'concept_list': ', '.join(enriched_data.get('concepts', [])[:10]),
        'other_books': book_list or 'No other completed books yet',
    }


def _prepare_reflection_section(
    section_type: str,
    enriched_data: dict[str, Any],
) -> dict[str, Any]:
    """Prepare data for reader_became and recommendations sections."""
    book_title = enriched_data.get('book', {}).get('title', '')
    concepts = ', '.join(enriched_data.get('concepts', [])[:10])
    themes = ', '.join(enriched_data.get('synthesis_themes', [])[:5])

    if section_type == 'reader_became':
        stats = enriched_data.get('stats', {})
        total_min = stats.get('total_reading_minutes', 0)
        return {
            'book_title': book_title,
            'book_author': enriched_data.get('book', {}).get('author', ''),
            'total_time': _format_duration(total_min),
            'session_count': stats.get('total_sessions', 0),
            'highlight_count': stats.get('total_highlights', 0),
            'note_count': stats.get('total_notes', 0),
            'concept_list': concepts,
            'theme_list': themes,
            'reading_archetype': enriched_data.get('encounter_archetype', 'The Explorer'),
            'mastery_score': enriched_data.get('mastery', {}).get('overallMastery', 0),
        }

    # recommendations
    return {
        'book_title': book_title,
        'top_themes': themes,
        'concept_list': concepts,
        'existing_books': ', '.join(enriched_data.get('existing_books', [])[:15]),
    }


# Dispatch table: section_type -> handler function
_SECTION_HANDLERS: dict[str, Any] = {
    'encounter': _prepare_session_section,
    'attention_map': _prepare_session_section,
    'highlights': _prepare_annotation_section,
    'conversations': _prepare_annotation_section,
    'annotations_woven': _prepare_annotation_section,
    'what_stuck': _prepare_knowledge_section,
    'concept_web': _prepare_knowledge_section,
    'threads': _prepare_knowledge_section,
    'reader_became': _prepare_reflection_section,
    'recommendations': _prepare_reflection_section,
}

# Handlers that need the budget parameter
_BUDGET_HANDLERS = {'highlights', 'conversations', 'annotations_woven'}


def _prepare_section_data(
    section_type: str,
    enriched_data: dict[str, Any],
    budget: TokenBudget,
) -> dict[str, Any]:
    """Prepare the data payload for a specific section type."""
    handler = _SECTION_HANDLERS.get(section_type)
    if handler is None:
        return {}
    if section_type in _BUDGET_HANDLERS:
        return handler(section_type, enriched_data, budget)
    return handler(section_type, enriched_data)


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
    section_names: dict[str, str] = {}
    return {
        'type': section_type,
        'title': section_names.get(section_type, section_type),
        'placeholder': True,
        'message': 'This section will be available in a future update.',
    }
