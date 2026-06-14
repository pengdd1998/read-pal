"""Data preparation for Reading Mirror sections (knowledge, reflection, and dispatch)."""

from __future__ import annotations

from typing import Any

from app.services.memory_book.section_data_prep import (
    _format_duration,
    _prepare_annotation_section,
    _prepare_session_section,
)
from app.utils.token_budget import TokenBudget


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


def prepare_section_data(
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
