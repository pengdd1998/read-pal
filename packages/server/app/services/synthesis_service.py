"""Synthesis service — cross-reference analysis across reading data."""

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
from app.models.reading_session import ReadingSession
from app.schemas.synthesis import SynthesisResponse
from app.services.llm import get_llm

logger = logging.getLogger('read-pal.synthesis')


def _match_type(value: object, target: AnnotationType) -> bool:
    """Compare annotation type — works with both enum members and strings."""
    if hasattr(value, 'value'):
        return value == target or value.value == target.value
    return value == target.value


async def _collect_reading_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    include_highlights: bool = True,
    include_notes: bool = True,
    include_conversations: bool = True,
) -> dict[str, Any]:
    """Collect all reading data for synthesis."""
    data: dict[str, Any] = {}

    # Load book info
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id),
    )
    book = result.scalar_one_or_none()
    if book is None:
        return data

    data['book'] = {
        'title': book.title,
        'author': book.author,
        'progress': float(book.progress),
        'status': book.status,
    }

    # Load annotations (highlights + notes)
    conditions = [
        Annotation.user_id == user_id,
        Annotation.book_id == book_id,
    ]
    result = await db.execute(
        select(Annotation).where(*conditions).order_by(Annotation.created_at),
    )
    annotations = list(result.scalars().all())

    if include_highlights:
        highlights = [
            {'content': a.content, 'note': a.note, 'tags': a.tags}
            for a in annotations
            if _match_type(a.type, AnnotationType.highlight)
        ]
        data['highlights'] = highlights

    if include_notes:
        notes = [
            {'content': a.content, 'note': a.note, 'tags': a.tags}
            for a in annotations
            if _match_type(a.type, AnnotationType.note)
        ]
        data['notes'] = notes

    # Load chat conversations
    if include_conversations:
        result = await db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.user_id == user_id,
                ChatMessage.book_id == book_id,
            )
            .order_by(ChatMessage.created_at),
        )
        messages = list(result.scalars().all())
        data['conversations'] = [
            {'role': m.role, 'content': m.content}
            for m in messages
        ]

    # Load reading sessions for timeline
    result = await db.execute(
        select(ReadingSession)
        .where(
            ReadingSession.user_id == user_id,
            ReadingSession.book_id == book_id,
        )
        .order_by(ReadingSession.started_at),
    )
    sessions = list(result.scalars().all())
    data['reading_sessions'] = [
        {
            'started_at': s.started_at.isoformat() if s.started_at else None,
            'duration': s.duration,
            'pages_read': s.pages_read,
            'highlights': s.highlights,
            'notes': s.notes,
        }
        for s in sessions
    ]

    return data


async def synthesize(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    include_highlights: bool = True,
    include_notes: bool = True,
    include_conversations: bool = True,
) -> SynthesisResponse:
    """Run cross-reference analysis across all reading data for a book.

    Returns structured synthesis with themes, connections, timeline, and insights.
    """
    reading_data = await _collect_reading_data(
        db,
        user_id,
        book_id,
        include_highlights,
        include_notes,
        include_conversations,
    )

    if not reading_data.get('book'):
        return SynthesisResponse(
            success=False,
            data={'error': 'Book not found'},
        )

    llm = get_llm()

    system_prompt = (
        'You are a reading analysis assistant. Synthesize the reader\'s data '
        'into a structured analysis. Return valid JSON with these keys:\n\n'
        '  "themes": array of {name, description, strength (0-1)}\n'
        '  "connections": array of {from, to, description}\n'
        '  "timeline": array of {date, event, significance}\n'
        '  "insights": array of {insight, confidence (0-1), evidence}\n\n'
        'Return ONLY the JSON object, no markdown fences.'
    )

    book_title = reading_data['book']['title']
    book_author = reading_data['book']['author']
    human_prompt = (
        f'Book: {book_title} '
        f'by {book_author}\n\n'
        f'Reading data:\n{json.dumps(reading_data, default=str)}'
    )

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])
    except Exception as exc:
        logger.error('Synthesis LLM call failed: %s', exc)
        return SynthesisResponse(
            success=True,
            data={
                'themes': [],
                'connections': [],
                'timeline': [],
                'insights': [],
                'error': 'AI synthesis temporarily unavailable',
            },
        )

    content = response.content.strip()
    if content.startswith('```'):
        lines = content.split('\n')
        content = '\n'.join(lines[1:-1])

    try:
        synthesis_data = json.loads(content)
    except json.JSONDecodeError:
        logger.warning('Failed to parse LLM synthesis response')
        synthesis_data = {
            'themes': [],
            'connections': [],
            'timeline': [],
            'insights': [],
        }

    return SynthesisResponse(success=True, data=synthesis_data)


async def cross_book_synthesize(
    db: AsyncSession,
    user_id: UUID,
    book_ids: list[UUID],
) -> SynthesisResponse:
    """Synthesize across multiple books — find common themes and connections."""
    all_book_data: list[dict[str, Any]] = []

    for bid in book_ids:
        data = await _collect_reading_data(db, user_id, bid, True, True, False)
        if data.get('book'):
            all_book_data.append(data)

    if not all_book_data:
        return SynthesisResponse(
            success=True,
            data={'themes': [], 'connections': [], 'book_summaries': []},
        )

    llm = get_llm()

    system_prompt = (
        'You are a cross-book analysis assistant. Compare the reader\'s data '
        'across multiple books and find common themes, contrasting viewpoints, '
        'and connections. Return valid JSON with:\n\n'
        '  "themes": array of {name, description, books: [book titles], strength}\n'
        '  "connections": array of {book_a, book_b, description}\n'
        '  "book_summaries": array of {title, key_takeaway}\n\n'
        'Return ONLY the JSON object, no markdown fences.'
    )

    # Build condensed data per book
    condensed = []
    for bd in all_book_data:
        book = bd.get('book', {})
        highlights = [h.get('content', '')[:100] for h in bd.get('highlights', [])[:10]]
        notes = [n.get('content', '')[:100] for n in bd.get('notes', [])[:5]]
        condensed.append({
            'title': book.get('title'),
            'author': book.get('author'),
            'highlights': highlights,
            'notes': notes,
        })

    human_prompt = (
        f'Analyze these {len(condensed)} books the reader has been reading:\n\n'
        f'{json.dumps(condensed, default=str)}'
    )

    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])
    except Exception as exc:
        logger.error('Cross-book synthesis LLM failed: %s', exc)
        return SynthesisResponse(
            success=True,
            data={
                'themes': [],
                'connections': [],
                'book_summaries': [
                    {'title': bd.get('book', {}).get('title', 'Unknown'), 'key_takeaway': ''}
                    for bd in all_book_data
                ],
                'error': 'AI synthesis temporarily unavailable',
            },
        )

    content = response.content.strip()
    if content.startswith('```'):
        lines = content.split('\n')
        content = '\n'.join(lines[1:-1])

    try:
        synthesis_data = json.loads(content)
    except json.JSONDecodeError:
        logger.warning('Failed to parse cross-book synthesis response')
        synthesis_data = {
            'themes': [],
            'connections': [],
            'book_summaries': [
                {'title': bd.get('book', {}).get('title', 'Unknown'), 'key_takeaway': ''}
                for bd in all_book_data
            ],
        }

    return SynthesisResponse(success=True, data=synthesis_data)
