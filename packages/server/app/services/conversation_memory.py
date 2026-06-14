"""Conversation memory -- rolling summarization for long-term chat context."""

import json
import time
from uuid import UUID

import structlog

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage
from app.prompts import CONVERSATION_SUMMARY_HUMAN, CONVERSATION_SUMMARY_SYSTEM
from app.schemas.llm_outputs import ConversationSummaryData
from app.services.llm import safe_llm_invoke
from app.utils.db import db_error_guard
from app.utils.sanitizer import sanitize_chat_message
from app.utils.token_budget import TokenBudget
from app.utils.limits import CONVERSATION_MEMORY_LIMIT

logger = structlog.get_logger('read-pal.memory')

# When to trigger summarization
SUMMARY_THRESHOLD = 30  # summarize when more than this many messages exist
SUMMARY_BATCH = 15       # compress oldest N messages into summary
MAX_RECENT = 20          # keep this many recent messages verbatim


async def _count_messages(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> int:
    """Count total chat messages for a user-book pair."""
    async with db_error_guard('_count_messages', user_id=str(user_id), book_id=str(book_id)):
        count_result = await db.execute(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.user_id == user_id,
                ChatMessage.book_id == book_id,
                ChatMessage.deleted_at.is_(None),
            )
        )
        return count_result.scalar() or 0


async def _load_existing_summary(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> 'ConversationSummary | None':
    """Load the most recent conversation summary from the database."""
    from app.models.conversation_summary import ConversationSummary
    async with db_error_guard('_load_existing_summary', user_id=str(user_id), book_id=str(book_id)):
        result = await db.execute(
            select(ConversationSummary)
            .where(
                ConversationSummary.user_id == user_id,
                ConversationSummary.book_id == book_id,
            )
            .order_by(ConversationSummary.updated_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()


def _log_summary_result(
    event: str,
    total: int,
    summary_length: int,
    latency_ms: int,
    user_id: UUID,
    book_id: UUID,
) -> None:
    """Log the outcome of a summary lookup or generation."""
    logger.info(
        event,
        message_count=total,
        summary_length=summary_length,
        latency_ms=latency_ms,
        user_id=str(user_id),
        book_id=str(book_id),
    )


async def get_or_create_summary(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> str | None:
    """Get existing summary, or create one if threshold is met.

    Returns the summary text or None if no summary exists/is needed.
    """
    t0 = time.monotonic()
    logger.info(
        'memory.get_or_create_summary.started',
        user_id=str(user_id),
        book_id=str(book_id),
    )

    total = await _count_messages(db, user_id, book_id)
    if total < SUMMARY_THRESHOLD:
        logger.info(
            'memory.get_or_create_summary.below_threshold',
            message_count=total,
            threshold=SUMMARY_THRESHOLD,
            user_id=str(user_id),
            book_id=str(book_id),
        )
        return None

    existing = await _load_existing_summary(db, user_id, book_id)

    if existing and existing.message_count >= total - MAX_RECENT:
        elapsed = int((time.monotonic() - t0) * 1000)
        _log_summary_result(
            'memory.get_or_create_summary.cache_hit',
            total, len(existing.summary), elapsed, user_id, book_id,
        )
        return existing.summary

    summary = await _generate_summary(db, user_id, book_id, existing)
    elapsed = int((time.monotonic() - t0) * 1000)
    _log_summary_result(
        'memory.get_or_create_summary.generated',
        total, len(summary) if summary else 0, elapsed, user_id, book_id,
    )
    return summary


async def _load_older_messages(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[ChatMessage]:
    """Load all messages for a conversation, capped at 200."""
    async with db_error_guard('_load_older_messages', user_id=str(user_id), book_id=str(book_id)):
        result = await db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.user_id == user_id,
                ChatMessage.book_id == book_id,
                ChatMessage.deleted_at.is_(None),
            )
            .order_by(ChatMessage.created_at)
            .limit(CONVERSATION_MEMORY_LIMIT)
        )
        return list(result.scalars().all())


def _build_summary_prompt(
    older: list[ChatMessage],
    existing_summary: str,
) -> list:
    """Build the system + human message pair for the LLM summary call."""
    conversation_text = _format_conversation(older)
    system_content = CONVERSATION_SUMMARY_SYSTEM.template

    human_parts: list[str] = []
    if existing_summary:
        human_parts.append(
            f'Existing summary:\n{existing_summary}\n\n'
            'Update this summary to incorporate the new conversation below:'
        )
    else:
        human_parts.append('New conversation to summarize:')

    human_parts.append(f'\n{conversation_text}')
    human_content = CONVERSATION_SUMMARY_HUMAN.template + '\n' + '\n'.join(human_parts)

    return [
        SystemMessage(content=system_content),
        HumanMessage(content=human_content),
    ]


async def _save_summary(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    existing: 'ConversationSummary | None',
    summary_text: str,
    message_count: int,
) -> None:
    """Persist the generated summary to the database."""
    from app.models.conversation_summary import ConversationSummary
    async with db_error_guard('_save_summary', user_id=str(user_id), book_id=str(book_id)):
        if existing:
            existing.summary = summary_text
            existing.message_count = message_count
            await db.flush()
        else:
            new_summary = ConversationSummary(
                user_id=user_id,
                book_id=book_id,
                summary=summary_text,
                message_count=message_count,
            )
            db.add(new_summary)
            await db.flush()


async def _generate_summary(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    existing: 'ConversationSummary | None' = None,
) -> str:
    """Generate a compressed summary of older conversation turns."""
    all_messages = await _load_older_messages(db, user_id, book_id)

    if len(all_messages) <= MAX_RECENT:
        return existing.summary if existing else ''

    older = all_messages[:-MAX_RECENT]
    existing_summary = existing.summary if existing else ''

    messages = _build_summary_prompt(older, existing_summary)

    summary_data = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='Conversation summary',
        schema_class=ConversationSummaryData,
        user_id=str(user_id),
        book_id=str(book_id),
    )

    if summary_data and isinstance(summary_data, dict):
        summary_text = _summarize_to_text(summary_data)
    else:
        summary_text = existing_summary

    await _save_summary(db, user_id, book_id, existing, summary_text, len(all_messages))
    return summary_text


def _format_conversation(messages: list[ChatMessage]) -> str:
    """Format chat messages into readable text for summarization.

    Applies input sanitization and token budgeting.
    """
    budget = TokenBudget(model='glm-4.7-flash', response_reserve=4000)
    parts: list[str] = []
    for msg in messages:
        role = 'User' if msg.role == 'user' else 'Companion'
        # Sanitize each message against prompt injection
        content = sanitize_chat_message(msg.content[:500])
        line = f'{role}: {content}'
        # Apply token budget
        line = budget.add(line, label=f'conversation_msg_{msg.id}')
        if not line:
            break
        parts.append(line)
    return '\n'.join(parts)


def _summarize_to_text(data: dict) -> str:
    """Convert structured ConversationSummaryData to a readable text summary."""
    topics = data.get('key_topics', [])
    insights = data.get('insights', [])
    questions = data.get('unresolved_questions', [])

    parts: list[str] = []
    if topics:
        parts.append(f'Key topics: {", ".join(topics)}.')
    if insights:
        parts.append(f'Insights: {" ".join(insights)}.')
    if questions:
        parts.append(f'Unresolved: {" ".join(questions)}.')

    return ' '.join(parts) if parts else json.dumps(data)
