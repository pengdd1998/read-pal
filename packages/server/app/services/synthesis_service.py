"""Synthesis service — cross-reference analysis across reading data."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.reading_session import ReadingSession
from app.schemas.synthesis import SynthesisResponse
from app.services.llm import get_llm

logger = logging.getLogger('read-pal.synthesis')


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
            if a.type == 'highlight'
        ]
        data['highlights'] = highlights

    if include_notes:
        notes = [
            {'content': a.content, 'note': a.note, 'tags': a.tags}
            for a in annotations
            if a.type == 'note'
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

    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt),
    ])

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
