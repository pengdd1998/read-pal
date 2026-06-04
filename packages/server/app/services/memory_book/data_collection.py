"""Data collection for Reading Mirror — raw book data and enrichment."""

from __future__ import annotations

import structlog
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.flashcard import Flashcard
from app.models.reading_session import ReadingSession
from app.utils.annotations import match_annotation_type
from app.utils.sanitizer import sanitize_user_input

logger = structlog.get_logger('read-pal.memory_book')


async def _collect_book_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect raw reading data (unchanged from v1)."""
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
    result = await db.execute(
        select(Annotation)
        .where(Annotation.user_id == user_id, Annotation.book_id == book_id)
        .order_by(Annotation.created_at)
        .limit(500),
    )
    annotations = list(result.scalars().all())
    data['highlights'] = [
        {
            'id': str(a.id),
            'content': sanitize_user_input(a.content, context='highlight_content'),
            'note': sanitize_user_input(a.note or '', context='highlight_note'),
            'tags': a.tags, 'location': a.location,
            'created_at': a.created_at.isoformat() if a.created_at else None,
        }
        for a in annotations if match_annotation_type(a.type, AnnotationType.highlight)
    ]
    data['notes'] = [
        {
            'id': str(a.id),
            'content': sanitize_user_input(a.content, context='note_content'),
            'note': sanitize_user_input(a.note or '', context='note_text'),
            'tags': a.tags,
            'created_at': a.created_at.isoformat() if a.created_at else None,
        }
        for a in annotations if match_annotation_type(a.type, AnnotationType.note)
    ]
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.book_id == book_id)
        .order_by(ChatMessage.created_at)
        .limit(200),
    )
    messages = list(result.scalars().all())
    data['conversations'] = [
        {
            'role': m.role,
            'content': sanitize_user_input(m.content, context='chat_message'),
        }
        for m in messages
    ]
    result = await db.execute(
        select(ReadingSession)
        .where(ReadingSession.user_id == user_id, ReadingSession.book_id == book_id)
        .order_by(ReadingSession.started_at)
        .limit(100),
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
        'total_reading_minutes': sum(s.duration for s in sessions) // 60,
        'total_pages_read': sum(s.pages_read for s in sessions),
    }

    # Flashcards for "What Stuck" section
    fc_result = await db.execute(
        select(Flashcard)
        .where(Flashcard.user_id == user_id, Flashcard.book_id == book_id)
        .order_by(Flashcard.created_at.desc())
        .limit(30),
    )
    flashcards = list(fc_result.scalars().all())
    data['flashcards'] = [
        {
            'question': fc.question,
            'answer': fc.answer[:200],
            'last_rating': fc.last_rating,
            'repetition_count': fc.repetition_count,
            'ease_factor': round(float(fc.ease_factor), 2),
        }
        for fc in flashcards
    ]
    data['stats']['total_flashcards'] = len(flashcards)
    return data


async def _collect_enriched_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect raw data + enrich with knowledge graph, mastery, and synthesis."""
    data = await _collect_book_data(db, user_id, book_id)
    if not data.get('book'):
        return data

    enriched: dict[str, Any] = {**data}

    # Knowledge graph concepts + edges for concept_web section
    try:
        from app.services.knowledge_service import build_graph
        graph = await build_graph(db, user_id, book_id)
        enriched['concepts'] = [n.label for n in graph.nodes if n.label]
        enriched['concept_nodes'] = [{'label': n.label, 'type': n.type, 'size': n.size} for n in graph.nodes]
        enriched['concept_edges'] = [{'source': e.source, 'target': e.target, 'label': e.label} for e in graph.edges if e.label]
    except Exception:
        logger.warning('Knowledge graph enrichment skipped for book %s', book_id, exc_info=True)
        enriched['concepts'] = []
        enriched['concept_nodes'] = []
        enriched['concept_edges'] = []

    # Study mode mastery
    try:
        from app.services.study_mode_service import get_mastery
        mastery = await get_mastery(db, user_id, book_id)
        enriched['mastery'] = mastery
    except Exception:
        logger.warning('Mastery enrichment skipped for book %s', book_id, exc_info=True)
        enriched['mastery'] = {}

    # Synthesis themes
    try:
        from app.services.synthesis_service import synthesize
        synthesis = await synthesize(db, user_id, book_id)
        themes = []
        syn_data = getattr(synthesis, 'data', None) or (synthesis if isinstance(synthesis, dict) else None)
        if isinstance(syn_data, dict):
            theme_list = syn_data.get('themes', [])
            themes = [t.get('name', '') for t in theme_list if isinstance(t, dict) and t.get('name')]
        enriched['synthesis_themes'] = themes
    except Exception:
        logger.warning('Synthesis enrichment skipped for book %s', book_id, exc_info=True)
        enriched['synthesis_themes'] = []

    # Compute reading pace and session details for Encounter section
    sessions = data.get('reading_sessions', [])
    if sessions:
        total_minutes = sum(s.get('duration', 0) for s in sessions) / 60
        total_pages = sum(s.get('pages_read', 0) for s in sessions)
        enriched['reading_pace'] = round(total_pages / max(total_minutes / 60, 0.1), 1)
        enriched['longest_session_minutes'] = max(s.get('duration', 0) for s in sessions) / 60
        enriched['first_session_date'] = sessions[0].get('started_at')
        enriched['last_session_date'] = sessions[-1].get('started_at')
    else:
        enriched['reading_pace'] = 0
        enriched['longest_session_minutes'] = 0
        enriched['first_session_date'] = None
        enriched['last_session_date'] = None

    # First highlight text (for Encounter prompt)
    highlights = data.get('highlights', [])
    enriched['first_highlight'] = highlights[0].get('content', '')[:200] if highlights else ''

    # User's other completed books (for recommendations + threads)
    try:
        result = await db.execute(
            select(Book.id, Book.title, Book.author)
            .where(Book.user_id == user_id, Book.id != book_id, Book.status == 'completed')
            .limit(20),
        )
        other_books = result.all()
        enriched['existing_books'] = [r[1] for r in other_books]
        enriched['other_books'] = [
            {'id': str(r[0]), 'title': r[1], 'author': r[2] or 'Unknown'}
            for r in other_books
        ]
    except Exception:
        logger.warning('Failed to query existing books for user %s', user_id, exc_info=True)
        enriched['existing_books'] = []
        enriched['other_books'] = []

    return enriched
