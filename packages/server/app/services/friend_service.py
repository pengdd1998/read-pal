"""Reading friend agent — personality-based AI personas."""

import time
from typing import Any
from uuid import UUID

import structlog

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.utils import utcnow
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import func

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.friend import FriendConversation, FriendRelationship
from app.models.reading_session import ReadingSession
from app.prompts import FRIEND_BOOK_CONTEXT, FRIEND_PERSONAS
from app.services.llm import safe_llm_call
from app.utils.sanitizer import sanitize_chat_message
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.friend')

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

    # Enforce token budget before calling the LLM
    budget = TokenBudget()
    budget.add(system_msg.content, label='system')
    for i, msg in enumerate(history):
        budget.add(msg.content, label=f'history[{i}]')
    budget.add(sanitized_message, label='user_message')

    if budget.truncations:
        logger.warning(
            'friend.chat.budget_truncated',
            truncations=', '.join(budget.truncations),
            user_id=str(user_id),
        )

    assistant_content = await safe_llm_call(
        messages,
        fallback="I'm having trouble thinking right now. Please try again in a moment.",
        log_label='Friend chat',
        user_id=str(user_id),
        book_id=str(book_id) if book_id else None,
    )

    await _save_message(db, user_id, persona, 'user', sanitized_message, book_id)
    await _save_message(
        db, user_id, persona, 'assistant', assistant_content, book_id,
    )

    # Update relationship stats
    rel.total_messages += 2
    rel.last_interaction_at = utcnow()
    await db.flush()

    elapsed = int((time.monotonic() - t0) * 1000)
    logger.info(
        'friend.chat.completed',
        persona=persona,
        total_messages=rel.total_messages,
        latency_ms=elapsed,
        user_id=str(user_id),
    )

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
        'books_read_together': rel.books_read_together,
        'total_messages': rel.total_messages,
        'last_interaction_at': (
            rel.last_interaction_at.isoformat()
            if rel.last_interaction_at
            else None
        ),
        'created_at': rel.created_at.isoformat() if rel.created_at else None,
    }


async def recommend_persona(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, str]:
    """Analyze user reading behavior and recommend the best persona."""
    sessions_q = await db.execute(
        select(func.count()).select_from(ReadingSession).where(
            ReadingSession.user_id == user_id,
        ),
    )
    total_sessions = sessions_q.scalar() or 0

    annotations_q = await db.execute(
        select(func.count()).select_from(Annotation).where(
            Annotation.user_id == user_id,
        ),
    )
    total_annotations = annotations_q.scalar() or 0

    chats_q = await db.execute(
        select(func.count()).select_from(ChatMessage).where(
            ChatMessage.user_id == user_id,
        ),
    )
    total_chats = chats_q.scalar() or 0

    books_q = await db.execute(
        select(func.count(Book.id.distinct())).where(
            Book.user_id == user_id,
        ),
    )
    distinct_books = books_q.scalar() or 0

    annotation_density = (
        total_annotations / total_sessions if total_sessions > 0 else 0
    )
    chat_propensity = total_chats / total_sessions if total_sessions > 0 else 0

    if annotation_density > 3.0 and total_sessions > 20:
        return {
            'recommendedPersona': 'alex',
            'reason': (
                'Based on your reading patterns, you annotate heavily '
                'and study systematically. Alex will match your '
                'analytical approach.'
            ),
        }
    if chat_propensity > 2.0:
        return {
            'recommendedPersona': 'quinn',
            'reason': (
                'Based on your reading patterns, you love discussing '
                'what you read. Quinn will spark creative conversations '
                'with you.'
            ),
        }
    if distinct_books > 5:
        return {
            'recommendedPersona': 'penny',
            'reason': (
                'Based on your reading patterns, you read widely across '
                'many books. Penny shares your enthusiasm for diverse '
                'reading.'
            ),
        }
    if annotation_density < 1.0 and total_sessions > 10:
        return {
            'recommendedPersona': 'sam',
            'reason': (
                'Based on your reading patterns, you stay focused on '
                'the text without many annotations. Sam will respect '
                'your practical style.'
            ),
        }
    return {
        'recommendedPersona': 'sage',
        'reason': (
            'Based on your reading patterns, Sage is a thoughtful '
            'companion who offers philosophical insights to deepen '
            'your reading.'
        ),
    }
