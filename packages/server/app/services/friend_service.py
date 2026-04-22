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
from app.prompts import FRIEND_BOOK_CONTEXT, FRIEND_PERSONAS
from app.services.llm import safe_llm_call
from app.utils.sanitizer import sanitize_chat_message
from app.utils.token_budget import TokenBudget

logger = logging.getLogger('read-pal.friend')

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
    persona_template = FRIEND_PERSONAS.get(persona, FRIEND_PERSONAS['sage'])
    parts = [persona_template.template]

    if book_id is not None:
        result = await db.execute(
            select(Book).where(
                Book.id == book_id,
                Book.user_id == user_id,
            ),
        )
        book = result.scalar_one_or_none()
        if book is not None:
            context_str = FRIEND_BOOK_CONTEXT.template.format(
                title=book.title, author=book.author, progress=book.progress or 0,
            )
            parts.append(context_str)

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

    sanitized_message = sanitize_chat_message(message)

    history = await _load_history(db, user_id, persona)
    system_msg = await _build_system_message(db, user_id, persona, book_id)

    messages = [system_msg] + history
    messages.append(HumanMessage(content=sanitized_message))

    # Enforce token budget before calling the LLM
    budget = TokenBudget()
    budget.add(system_msg.content, label='system')
    for i, msg in enumerate(history):
        budget.add(msg.content, label=f'history[{i}]')
    budget.add(sanitized_message, label='user_message')

    if budget.truncations:
        logger.warning(
            'Token budget truncations for user %s: %s',
            user_id, budget.truncations,
        )

    assistant_content = await safe_llm_call(
        messages,
        fallback="I'm having trouble thinking right now. Please try again in a moment.",
        log_label='Friend chat',
    )

    await _save_message(db, user_id, persona, 'user', sanitized_message, book_id)
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
