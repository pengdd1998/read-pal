"""Reading friend agent — personality-based AI personas."""

import time
from typing import Any
from uuid import UUID

import structlog

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.utils import utcnow
from app.models.book import Book
from app.models.friend import FriendConversation, FriendRelationship
from app.prompts import FRIEND_BOOK_CONTEXT, FRIEND_PERSONAS
from app.services.friend_persona import recommend_persona
from app.db import release_db
from app.services.llm import safe_llm_call
from app.utils.db import db_error_guard
from app.utils.sanitizer import sanitize_book_field, sanitize_chat_message
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.friend')

HISTORY_LIMIT = 30

# Re-export for backward compatibility
__all__ = ['chat', 'get_relationship', 'recommend_persona']


async def _get_or_create_relationship(
    db: AsyncSession,
    user_id: UUID,
) -> FriendRelationship:
    """Return the existing relationship or create a default one."""
    async with db_error_guard(
        '_get_or_create_relationship',
        user_id=str(user_id),
    ):
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
    async with db_error_guard(
        '_load_history',
        user_id=str(user_id), persona=persona,
    ):
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
        try:
            result = await db.execute(
                select(Book).where(
                    Book.id == book_id,
                    Book.user_id == user_id,
                ),
            )
            book = result.scalar_one_or_none()
        except (DBAPIError, OSError):
            logger.error(
                'Failed to query book for friend context',
                exc_info=True,
                user_id=str(user_id),
                book_id=str(book_id),
            )
            book = None
        if book is not None:
            context_str = FRIEND_BOOK_CONTEXT.template.format(
                title=sanitize_book_field(book.title, field='title'),
                author=sanitize_book_field(book.author, field='author'),
                progress=book.progress or 0,
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


def _apply_token_budget(
    system_msg: SystemMessage,
    history: list[HumanMessage | AIMessage],
    user_message: str,
    user_id: UUID,
) -> None:
    """Enforce token budget on the message list, logging any truncations."""
    budget = TokenBudget()
    budget.add(system_msg.content, label='system')
    for i, msg in enumerate(history):
        budget.add(msg.content, label=f'history[{i}]')
    budget.add(user_message, label='user_message')

    if budget.truncations:
        logger.warning(
            'friend.chat.budget_truncated',
            truncations=', '.join(budget.truncations),
            user_id=str(user_id),
        )


async def _call_llm_and_persist(
    db: AsyncSession,
    user_id: UUID,
    persona: str,
    book_id: UUID | None,
    messages: list,
    sanitized_message: str,
) -> str:
    """Persist user message, call the LLM, then persist the assistant reply.

    Order matters: saving the user message BEFORE the LLM call guarantees the
    user's question is durably logged even if the LLM call or the assistant
    save fails. Without this ordering, a mid-flight failure could leave no
    trace of the user's message and the next turn would silently drop it
    from history.
    """
    await _save_message(db, user_id, persona, 'user', sanitized_message, book_id)
    await release_db(db)  # release pooled conn during LLM wait
    assistant_content = await safe_llm_call(
        messages,
        fallback="I'm having trouble thinking right now. Please try again in a moment.",
        log_label='Friend chat',
        user_id=str(user_id),
        book_id=str(book_id) if book_id else None,
    )
    try:
        await _save_message(
            db, user_id, persona, 'assistant', assistant_content, book_id,
        )
    except DBAPIError as exc:
        # LLM cost already incurred but assistant reply couldn't be persisted.
        # Log loudly so this surface — the conversation history is now
        # asymmetric (user question without a paired assistant reply).
        logger.error(
            'friend.chat.assistant_persist_failed',
            user_id=str(user_id),
            persona=persona,
            error=str(exc)[:500],
        )
        raise
    return assistant_content


def _log_chat_completed(
    persona: str,
    total_messages: int,
    latency_ms: int,
    user_id: UUID,
) -> None:
    """Log the completion of a friend chat turn."""
    logger.info(
        'friend.chat.completed',
        persona=persona,
        total_messages=total_messages,
        latency_ms=latency_ms,
        user_id=str(user_id),
    )


async def chat(
    db: AsyncSession,
    user_id: UUID,
    persona: str,
    message: str,
    book_id: UUID | None = None,
) -> dict[str, Any]:
    """Run a single-turn friend chat and return the assistant response."""
    t0 = time.monotonic()
    logger.info(
        'friend.chat.started',
        persona=persona,
        user_id=str(user_id),
        book_id=str(book_id) if book_id else None,
    )

    rel = await _get_or_create_relationship(db, user_id)
    if persona not in FRIEND_PERSONAS:
        persona = 'sage'
    rel.persona = persona

    sanitized_message = sanitize_chat_message(message)
    history = await _load_history(db, user_id, persona)
    system_msg = await _build_system_message(db, user_id, persona, book_id)

    messages = [system_msg] + history
    messages.append(HumanMessage(content=sanitized_message))
    _apply_token_budget(system_msg, history, sanitized_message, user_id)

    assistant_content = await _call_llm_and_persist(
        db, user_id, persona, book_id, messages, sanitized_message,
    )

    rel.total_messages += 2
    rel.last_interaction_at = utcnow()
    await db.flush()

    elapsed = int((time.monotonic() - t0) * 1000)
    _log_chat_completed(persona, rel.total_messages, elapsed, user_id)

    return {'role': 'assistant', 'content': assistant_content}


async def get_relationship(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, Any]:
    """Get the friend relationship info for a user."""
    logger.info(
        'friend.get_relationship.started',
        user_id=str(user_id),
    )
    rel = await _get_or_create_relationship(db, user_id)
    return {
        'persona': rel.persona,
        'booksReadTogether': rel.books_read_together,
        'totalMessages': rel.total_messages,
        'lastInteractionAt': (
            rel.last_interaction_at.isoformat()
            if rel.last_interaction_at
            else None
        ),
        'createdAt': rel.created_at.isoformat() if rel.created_at else None,
    }
