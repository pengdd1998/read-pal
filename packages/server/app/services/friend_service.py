"""Reading friend agent — personality-based AI personas."""

import logging
from typing import Any
from uuid import UUID

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.utils import utcnow
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.friend import FriendConversation, FriendRelationship
from app.services.llm import get_llm

logger = logging.getLogger('read-pal.friend')

PERSONA_PROMPTS: dict[str, str] = {
    'sage': (
        'You are Sage, a wise and philosophical reading friend. '
        'You ask deep questions, reference literature and philosophy, '
        'and help readers see the deeper meaning in what they read. '
        'Your tone is thoughtful and measured.'
    ),
    'penny': (
        'You are Penny, an enthusiastic and encouraging reading friend! '
        'You celebrate every reading milestone, suggest fun reading '
        'challenges, and always keep the conversation upbeat and motivating. '
        'You love sharing your excitement about books.'
    ),
    'alex': (
        'You are Alex, an analytical and structured reading friend. '
        'You create summaries and study guides, focus on key concepts, '
        'and help readers organize their understanding. '
        'Your tone is clear and systematic.'
    ),
    'quinn': (
        'You are Quinn, a creative reading friend who loves making '
        'connections between books and life. You suggest writing exercises, '
        'draw parallels across genres, and inspire creative thinking. '
        'Your tone is imaginative and playful.'
    ),
    'sam': (
        'You are Sam, a casual and friendly reading buddy. '
        'You discuss books like you are chatting with a friend at a cafe — '
        'relaxed, fun, and full of recommendations for similar books. '
        'Your tone is warm and approachable.'
    ),
}

HISTORY_LIMIT = 30


async def _get_or_create_relationship(
    db: AsyncSession,
    user_id: UUID,
) -> FriendRelationship:
    """Return the existing relationship or create a default one."""
    result = await db.execute(
        select(FriendRelationship).where(
            FriendRelationship.user_id == user_id,
        ),
    )
    rel = result.scalar_one_or_none()
    if rel is not None:
        return rel

    rel = FriendRelationship(user_id=user_id, persona='sage')
    db.add(rel)
    await db.flush()
    return rel


async def _load_history(
    db: AsyncSession,
    user_id: UUID,
    persona: str,
) -> list[HumanMessage | AIMessage]:
    """Load recent conversation history for a persona."""
    result = await db.execute(
        select(FriendConversation)
        .where(
            FriendConversation.user_id == user_id,
            FriendConversation.persona == persona,
        )
        .order_by(FriendConversation.created_at.desc())
        .limit(HISTORY_LIMIT)
    )
    rows = list(reversed(result.scalars().all()))
    messages: list[HumanMessage | AIMessage] = []
    for row in rows:
        if row.role == 'user':
            messages.append(HumanMessage(content=row.content))
        elif row.role == 'assistant':
            messages.append(AIMessage(content=row.content))
    return messages


async def _build_system_message(
    db: AsyncSession,
    user_id: UUID,
    persona: str,
    book_id: UUID | None = None,
) -> SystemMessage:
    """Build the persona system message, optionally with book context."""
    base = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS['sage'])
    parts = [base]

    if book_id is not None:
        result = await db.execute(
            select(Book).where(
                Book.id == book_id,
                Book.user_id == user_id,
            ),
        )
        book = result.scalar_one_or_none()
        if book is not None:
            parts.append(
                f'\n\nThe user is currently reading "{book.title}" '
                f'by {book.author} ({book.progress}% complete). '
                f'Reference this book when relevant.',
            )

    return SystemMessage(content=''.join(parts))


async def _save_message(
    db: AsyncSession,
    user_id: UUID,
    persona: str,
    role: str,
    content: str,
    book_id: UUID | None = None,
) -> None:
    """Persist a single friend conversation message."""
    msg = FriendConversation(
        user_id=user_id,
        persona=persona,
        role=role,
        content=content,
        context={'book_id': str(book_id)} if book_id else None,
    )
    db.add(msg)
    await db.flush()


async def chat(
    db: AsyncSession,
    user_id: UUID,
    persona: str,
    message: str,
    book_id: UUID | None = None,
) -> dict[str, Any]:
    """Run a single-turn friend chat and return the assistant response."""
    rel = await _get_or_create_relationship(db, user_id)
    rel.persona = persona

    history = await _load_history(db, user_id, persona)
    system_msg = await _build_system_message(db, user_id, persona, book_id)

    messages = [system_msg] + history
    messages.append(HumanMessage(content=message))

    llm = get_llm()
    response: AIMessage = await llm.ainvoke(messages)
    assistant_content = response.content

    await _save_message(db, user_id, persona, 'user', message, book_id)
    await _save_message(
        db, user_id, persona, 'assistant', assistant_content, book_id,
    )

    # Update relationship stats
    rel.total_messages += 2
    rel.last_interaction_at = utcnow()
    await db.flush()

    return {'role': 'assistant', 'content': assistant_content}


async def get_relationship(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, Any]:
    """Get the friend relationship info for a user."""
    rel = await _get_or_create_relationship(db, user_id)
    return {
        'persona': rel.persona,
        'books_read_together': rel.books_read_together,
        'total_messages': rel.total_messages,
        'last_interaction_at': (
            rel.last_interaction_at.isoformat()
            if rel.last_interaction_at
            else None
        ),
        'created_at': rel.created_at.isoformat() if rel.created_at else None,
    }
