"""Memory book service — 6-chapter Personal Reading Book generation."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.memory_book import MemoryBook
from app.models.reading_session import ReadingSession
from app.schemas.memory_book import MemoryBookResponse
from app.services.llm import get_llm

logger = logging.getLogger('read-pal.memory_book')


def _match_type(value: object, target: AnnotationType) -> bool:
    """Compare annotation type — works with both enum members and strings."""
    if hasattr(value, 'value'):
        return value == target or value.value == target.value
    return value == target.value

CHAPTER_PROMPTS = {
    1: (
        'Create the Cover chapter. Include a compelling title, reading date range, '
        'and a stats summary (total highlights, notes, reading time, pages read). '
        'Return as JSON: {"title": str, "stats": {key: value}}'
    ),
    2: (
        'Create the Reading Journey chapter. Build a timeline from the reading '
        'sessions showing progress milestones and pace changes. '
        'Return as JSON: {"title": "Reading Journey", "entries": [{date, event, milestone}]}'
    ),
    3: (
        'Create the Highlights chapter. Select the most impactful highlights '
        'and add brief AI commentary for each explaining its significance. '
        'Return as JSON: {"title": "Highlights", "items": [{quote, commentary, location}]}'
    ),
    4: (
        'Create the Notes & Insights chapter. Organize the reader\'s notes '
        'thematically and draw connections between them. '
        'Return as JSON: {"title": "Notes & Insights", "themes": [{name, notes: [{content, connection}]}]}'
    ),
    5: (
        'Create the Conversations chapter. Extract key moments from AI chat '
        'history — questions asked, insights discovered, topics explored. '
        'Return as JSON: {"title": "Conversations", "moments": [{question, answer, topic}]}'
    ),
    6: (
        'Create the Looking Forward chapter. Based on themes and interests, '
        'suggest next books to read, topics to explore deeper, and reading goals. '
        'Return as JSON: {"title": "Looking Forward", "recommendations": [{type, title, reason}]}'
    ),
}


async def _collect_book_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect all data needed for memory book generation."""
    data: dict[str, Any] = {}
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id),
    )
    book = result.scalar_one_or_none()
    if book is None:
        return data

    data['book'] = {
        'id': str(book.id), 'title': book.title, 'author': book.author,
        'cover_url': book.cover_url, 'progress': float(book.progress),
        'status': book.status,
        'started_at': book.started_at.isoformat() if book.started_at else None,
        'completed_at': book.completed_at.isoformat() if book.completed_at else None,
    }
    # Annotations
    result = await db.execute(
        select(Annotation)
        .where(Annotation.user_id == user_id, Annotation.book_id == book_id)
        .order_by(Annotation.created_at),
    )
    annotations = list(result.scalars().all())
    data['highlights'] = [
        {'content': a.content, 'note': a.note, 'tags': a.tags, 'location': a.location}
        for a in annotations if _match_type(a.type, AnnotationType.highlight)
    ]
    data['notes'] = [
        {'content': a.content, 'note': a.note, 'tags': a.tags}
        for a in annotations if _match_type(a.type, AnnotationType.note)
    ]
    # Chat messages
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.book_id == book_id)
        .order_by(ChatMessage.created_at),
    )
    messages = list(result.scalars().all())
    data['conversations'] = [
        {'role': m.role, 'content': m.content} for m in messages
    ]
    # Reading sessions
    result = await db.execute(
        select(ReadingSession)
        .where(ReadingSession.user_id == user_id, ReadingSession.book_id == book_id)
        .order_by(ReadingSession.started_at),
    )
    sessions = list(result.scalars().all())
    data['reading_sessions'] = [
        {'started_at': s.started_at.isoformat() if s.started_at else None,
         'duration': s.duration, 'pages_read': s.pages_read,
         'highlights': s.highlights, 'notes': s.notes}
        for s in sessions
    ]
    data['stats'] = {
        'total_highlights': len(data['highlights']),
        'total_notes': len(data['notes']),
        'total_conversations': len(data['conversations']),
        'total_sessions': len(sessions),
        'total_reading_minutes': sum(s.duration for s in sessions),
        'total_pages_read': sum(s.pages_read for s in sessions),
    }
    return data


async def _generate_chapter(
    chapter_num: int,
    book_data: dict[str, Any],
    book_format: str,
) -> dict[str, Any]:
    """Generate a single chapter via LLM."""
    llm = get_llm()
    prompt = CHAPTER_PROMPTS.get(chapter_num, 'Generate chapter content.')
    book_title = book_data.get('book', {}).get('title', 'Unknown')
    book_author = book_data.get('book', {}).get('author', 'Unknown')

    system_prompt = (
        f'You are creating a Personal Reading Book for "{book_title}" '
        f'by {book_author}. Format: {book_format}. '
        f'{prompt} Return ONLY valid JSON, no markdown fences.'
    )

    relevant_data: dict[str, Any] = {}
    if chapter_num == 1:
        relevant_data = book_data.get('stats', {})
    elif chapter_num == 2:
        relevant_data = book_data.get('reading_sessions', [])
    elif chapter_num == 3:
        relevant_data = book_data.get('highlights', [])[:30]
    elif chapter_num == 4:
        relevant_data = book_data.get('notes', [])[:30]
    elif chapter_num == 5:
        relevant_data = book_data.get('conversations', [])[:30]
    elif chapter_num == 6:
        relevant_data = {
            'themes': book_data.get('highlights', [])[:10],
            'notes': book_data.get('notes', [])[:10],
        }

    human_prompt = json.dumps(relevant_data, default=str)
    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])
    except Exception as exc:
        logger.error('Memory book chapter %d LLM failed: %s', chapter_num, exc)
        return {
            'chapter': chapter_num,
            'title': f'Chapter {chapter_num}',
            'error': 'AI generation temporarily unavailable. Try regenerating later.',
        }

    content = response.content.strip()
    if content.startswith('```'):
        lines = content.split('\n')
        content = '\n'.join(lines[1:-1])

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.warning('Failed to parse chapter %d response', chapter_num)
        return {'chapter': chapter_num, 'error': 'Generation failed'}


def _esc(text: str) -> str:
    """Escape text for safe HTML embedding."""
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _render_html(
    book_data: dict[str, Any],
    sections: list[dict[str, Any]],
    stats: dict[str, Any],
) -> str:
    """Render the full memory book as styled HTML."""
    book = book_data.get('book', {})
    book_title = _esc(book.get('title', 'Memory Book'))
    book_author = _esc(book.get('author', ''))

    chapter_html_parts: list[str] = []
    for section in sections:
        title = section.get('title', 'Chapter')
        content_html = json.dumps(section, indent=2, ensure_ascii=False)
        chapter_html_parts.append(
            f'<section class="chapter"><h2>{_esc(title)}</h2>'
            + f'<div class="chapter-content"><pre>{_esc(content_html)}</pre></div>'
            + '</section>'
        )

    chapters_html = '\n'.join(chapter_html_parts)
    stats_html = ''.join(
        f'<li><strong>{_esc(k)}:</strong> {_esc(str(v))}</li>'
        for k, v in stats.items()
    )

    css = (
        'body{font-family:Georgia,serif;max-width:900px;margin:0 auto;padding:2rem;'
        'color:#2d2d2d;background:#fafaf8}'
        '.cover{text-align:center;padding:4rem 0;border-bottom:2px solid #e0d8cf;margin-bottom:2rem}'
        '.cover h1{font-size:2.5rem;margin-bottom:.5rem}'
        '.cover h2{color:#6b5e50;font-weight:normal}'
        '.stats ul{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:.5rem}'
        '.chapter{margin:2rem 0;padding:1.5rem;background:#fff;border-radius:8px;border:1px solid #e0d8cf}'
        '.chapter h2{color:#4a3f35;border-bottom:1px solid #e0d8cf;padding-bottom:.5rem}'
        '.chapter-content pre{white-space:pre-wrap;font-size:.9rem;color:#555}'
        '@media print{body{background:#fff} .chapter{break-inside:avoid}}'
    )

    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        + f'<title>{book_title} — Personal Reading Book</title>'
        + f'<style>{css}</style></head><body>'
        + f'<div class="cover"><h1>{book_title}</h1>'
        + f'<h2>by {book_author}</h2>'
        + '<p>A Personal Reading Book</p></div>'
        + f'<div class="stats"><ul>{stats_html}</ul></div>'
        + chapters_html
        + '</body></html>'
    )


async def generate(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    book_format: str = 'personal_book',
) -> MemoryBookResponse:
    """Generate a 6-chapter Personal Reading Book.

    Pipeline: collect data -> generate chapters via LLM -> render HTML -> save.
    """
    book_data = await _collect_book_data(db, user_id, book_id)
    if not book_data.get('book'):
        raise ValueError('Book not found')

    # Generate all 6 chapters
    sections: list[dict[str, Any]] = []
    for chapter_num in range(1, 7):
        try:
            chapter = await _generate_chapter(chapter_num, book_data, book_format)
            sections.append(chapter)
        except Exception:
            logger.exception('Failed to generate chapter %d', chapter_num)
            sections.append({'chapter': chapter_num, 'error': 'Generation failed'})

    stats = book_data.get('stats', {})

    # Render HTML
    html_content = _render_html(book_data, sections, stats)

    # Save to database (upsert)
    result = await db.execute(
        select(MemoryBook).where(
            MemoryBook.user_id == user_id,
            MemoryBook.book_id == book_id,
        ),
    )
    existing = result.scalar_one_or_none()

    book_title = book_data['book']['title']
    memory_book_title = f'{book_title} — Personal Reading Book'

    if existing:
        existing.sections = sections
        existing.stats = stats
        existing.html_content = html_content
        existing.format = book_format
        existing.title = memory_book_title
        await db.flush()
        memory_book = existing
    else:
        memory_book = MemoryBook(
            user_id=user_id,
            book_id=book_id,
            title=memory_book_title,
            format=book_format,
            sections=sections,
            stats=stats,
            html_content=html_content,
        )
        db.add(memory_book)
        await db.flush()

    return MemoryBookResponse.model_validate(memory_book)
