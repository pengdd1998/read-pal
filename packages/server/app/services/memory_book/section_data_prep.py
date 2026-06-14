"""Data preparation helpers for Reading Mirror sections (session & annotation handlers)."""

from __future__ import annotations

import json
from typing import Any

from app.utils.token_budget import TokenBudget


def _format_duration(total_minutes: int) -> str:
    """Format minutes into human-readable duration string."""
    hours = total_minutes // 60
    mins = total_minutes % 60
    return f'{hours}h {mins}m' if hours > 0 else f'{mins}m'


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
        # Report the count the LLM actually sees (budgeted), not the full DB
        # count. Otherwise the LLM is told "you have 247 highlights" while only
        # seeing 30, producing inflated cluster claims.
        return {
            'count': len(budgeted),
            'total_in_book': len(enriched_data.get('highlights', [])),
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
