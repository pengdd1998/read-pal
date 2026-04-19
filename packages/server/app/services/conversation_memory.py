"""Conversation memory — rolling summarization for long-term chat context."""

import logging
from uuid import UUID

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage
from app.services.llm import get_llm

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
    # Load older messages (skip the most recent MAX_RECENT)
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user_id,
            ChatMessage.book_id == book_id,
        )
        .order_by(ChatMessage.created_at)
    )
    all_messages = list(result.scalars().all())

    # Separate into "to summarize" and "keep recent"
    if len(all_messages) <= MAX_RECENT:
        return existing.summary if existing else ''

    older = all_messages[:-MAX_RECENT]

    # Build conversation text for LLM
    conversation_text = _format_conversation(older)

    existing_summary = existing.summary if existing else ''

    prompt_parts = [
        'You are summarizing a conversation between a reader and their AI reading companion.',
        'Create a concise summary (3-5 sentences) capturing:',
        '- Key topics discussed',
        '- Important insights or questions raised',
        '- Any unresolved questions or themes the user was exploring',
    ]

    if existing_summary:
        prompt_parts.append(
            f'\nExisting summary:\n{existing_summary}\n\n'
            'Update this summary to incorporate the new conversation below:'
        )
    else:
        prompt_parts.append('\nNew conversation to summarize:')

    prompt_parts.append(f'\n{conversation_text}')

    messages = [
        SystemMessage(content='\n'.join(prompt_parts)),
        HumanMessage(content='Generate the updated conversation summary.'),
    ]

    llm = get_llm(temperature=0.3, max_tokens=500)
    try:
        response = await llm.ainvoke(messages)
        summary_text = response.content.strip()
    except Exception as exc:
        logger.error('Summary generation failed: %s', exc)
        return existing_summary

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
    """Format chat messages into readable text for summarization."""
    parts: list[str] = []
    for msg in messages:
        role = 'User' if msg.role == 'user' else 'Companion'
        # Truncate long messages
        content = msg.content[:500]
        parts.append(f'{role}: {content}')
    return '\n'.join(parts)
