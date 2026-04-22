"""Conversation memory — rolling summarization for long-term chat context."""

import json
import logging
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage
from app.prompts import CONVERSATION_SUMMARY_HUMAN, CONVERSATION_SUMMARY_SYSTEM
from app.schemas.llm_outputs import ConversationSummaryData
from app.services.llm import safe_llm_invoke
from app.utils.sanitizer import sanitize_chat_message
from app.utils.token_budget import TokenBudget

logger = logging.getLogger('read-pal.memory')

# When to trigger summarization
SUMMARY_THRESHOLD = 30  # summarize when more than this many messages exist
SUMMARY_BATCH = 15       # compress oldest N messages into summary
MAX_RECENT = 20          # keep this many recent messages verbatim


async def get_or_create_summary(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> str | None:
    """Get existing summary, or create one if threshold is met.

    Returns the summary text or None if no summary exists/is needed.
    """
    # Check total message count
    count_result = await db.execute(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.user_id == user_id,
            ChatMessage.book_id == book_id,
        )
    )
    total = count_result.scalar() or 0

    if total < SUMMARY_THRESHOLD:
        return None

    # Load existing summary from DB
    from app.models.conversation_summary import ConversationSummary
    result = await db.execute(
        select(ConversationSummary)
        .where(
            ConversationSummary.user_id == user_id,
            ConversationSummary.book_id == book_id,
        )
        .order_by(ConversationSummary.updated_at.desc())
        .limit(1)
    )
    existing = result.scalar_one_or_none()

    # Check if we need to update the summary
    if existing and existing.message_count >= total - MAX_RECENT:
        return existing.summary

    # Need to generate/update summary
    summary = await _generate_summary(db, user_id, book_id, existing)
    return summary


async def _generate_summary(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    existing: 'ConversationSummary | None' = None,
) -> str:
    """Generate a compressed summary of older conversation turns."""
    # Load older messages (skip the most recent MAX_RECENT), capped at 200
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user_id,
            ChatMessage.book_id == book_id,
        )
        .order_by(ChatMessage.created_at)
        .limit(200)
    )
    all_messages = list(result.scalars().all())

    # Separate into "to summarize" and "keep recent"
    if len(all_messages) <= MAX_RECENT:
        return existing.summary if existing else ''

    older = all_messages[:-MAX_RECENT]

    # Build conversation text with sanitization and token budgeting
    conversation_text = _format_conversation(older)

    existing_summary = existing.summary if existing else ''

    # Build system prompt from centralized template
    system_content = CONVERSATION_SUMMARY_SYSTEM.template

    # Build human prompt with context
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

    messages = [
        SystemMessage(content=system_content),
        HumanMessage(content=human_content),
    ]

    # Use safe_llm_invoke with Pydantic output validation
    summary_data = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='Conversation summary',
        schema_class=ConversationSummaryData,
    )

    # Convert structured output to text summary for storage
    if summary_data and isinstance(summary_data, dict):
        summary_text = _summarize_to_text(summary_data)
    else:
        summary_text = existing_summary

    # Save/update in DB
    from app.models.conversation_summary import ConversationSummary
    if existing:
        existing.summary = summary_text
        existing.message_count = len(all_messages)
        await db.flush()
    else:
        new_summary = ConversationSummary(
            user_id=user_id,
            book_id=book_id,
            summary=summary_text,
            message_count=len(all_messages),
        )
        db.add(new_summary)
        await db.flush()

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
