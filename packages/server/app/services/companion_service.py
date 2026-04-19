"""Reading companion agent — AI chat, summarization, explanation, and tools."""

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.services.llm import get_llm

logger = logging.getLogger('read-pal.companion')

# ---------------------------------------------------------------------------
# System prompt templates
# ---------------------------------------------------------------------------

SYSTEM_TEMPLATE = (
    'You are an AI reading companion helping the user understand '
    '"{title}" by {author}.\n'
    'The user is {progress}% through the book '
    '(currently on page {current_page} of {total_pages}).\n'
    'Be insightful, ask thought-provoking questions, and connect ideas '
    'across the text.\n'
    'Keep responses concise (2-3 paragraphs max).'
)

SOCRATIC_SYSTEM_TEMPLATE = (
    'You are an AI reading companion helping the user understand '
    '"{title}" by {author}.\n'
    'The user is {progress}% through the book '
    '(currently on page {current_page} of {total_pages}).\n\n'
    'IMPORTANT: You are in SOCRATIC mode. Instead of giving direct answers, '
    'guide the user to discover insights themselves:\n'
    '- Ask probing questions that lead to deeper understanding\n'
    '- Offer hints and partial observations, not full explanations\n'
    '- Challenge assumptions and encourage critical thinking\n'
    '- When the user is stuck, provide a small nudge, not the full answer\n'
    '- Celebrate when the user reaches an insight on their own\n'
    'Keep responses concise (2-3 paragraphs max).'
)

HISTORY_LIMIT = 20
ANNOTATION_LIMIT = 10

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _load_book(db: AsyncSession, user_id: UUID, book_id: UUID) -> Book:
    """Fetch book or raise a ValueError."""
    result = await db.execute(
        select(Book).where(
            Book.id == book_id,
            Book.user_id == user_id,
        ),
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise ValueError(f'Book {book_id} not found for user {user_id}')
    return book


async def _load_history(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[HumanMessage | AIMessage]:
    """Load recent chat history as langchain messages."""
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user_id,
            ChatMessage.book_id == book_id,
        )
        .order_by(ChatMessage.created_at.desc())
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


async def _load_annotations_context(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> str:
    """Load recent highlights/notes to enrich the system prompt."""
    result = await db.execute(
        select(Annotation)
        .where(
            Annotation.user_id == user_id,
            Annotation.book_id == book_id,
        )
        .order_by(Annotation.created_at.desc())
        .limit(ANNOTATION_LIMIT)
    )
    annotations = result.scalars().all()
    if not annotations:
        return ''

    parts: list[str] = []
    for ann in annotations:
        label = ann.type.value if hasattr(ann.type, 'value') else ann.type
        entry = f'[{label}] {ann.content}'
        if ann.note:
            entry += f' (note: {ann.note})'
        parts.append(entry)
    return '\n'.join(parts)


def _build_system_prompt(
    book: Book,
    annotations_ctx: str,
    rag_ctx: str = '',
    memory_summary: str = '',
    companion_mode: str = 'casual',
    context: dict | None = None,
) -> str:
    """Build the system prompt from all available context."""
    template = (
        SOCRATIC_SYSTEM_TEMPLATE
        if companion_mode == 'socratic'
        else SYSTEM_TEMPLATE
    )
    prompt = template.format(
        title=book.title,
        author=book.author,
        progress=book.progress,
        current_page=book.current_page,
        total_pages=book.total_pages,
    )
    if annotations_ctx:
        prompt += (
            '\n\nThe user has made these recent annotations:\n'
            + annotations_ctx
        )
    if rag_ctx:
        prompt += (
            '\n\nRelevant passages from the book:\n'
            + rag_ctx
        )
    if memory_summary:
        prompt += (
            '\n\nSummary of previous conversation context:\n'
            + memory_summary
        )
    if context:
        extra_parts: list[str] = []
        if context.get('chapterContent'):
            content = context['chapterContent'][:3000]
            extra_parts.append(f'Current chapter content:\n{content}')
        if context.get('nearbyCode'):
            extra_parts.append(f'Nearby code examples:\n{context["nearbyCode"]}')
        if context.get('bookDescription'):
            extra_parts.append(f'Book description: {context["bookDescription"]}')
        if extra_parts:
            prompt += '\n\n' + '\n\n'.join(extra_parts)
    return prompt


async def _save_message(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    role: str,
    content: str,
) -> None:
    """Persist a single chat message."""
    msg = ChatMessage(
        user_id=user_id,
        book_id=book_id,
        role=role,
        content=content,
    )
    db.add(msg)
    await db.flush()


# ---------------------------------------------------------------------------
# Public API — chat, stream, summarize, explain
# ---------------------------------------------------------------------------


async def chat(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
) -> dict[str, Any]:
    """Run a single-turn companion chat and return the assistant response."""
    book = await _load_book(db, user_id, book_id)
    annotations_ctx = await _load_annotations_context(db, user_id, book_id)
    history = await _load_history(db, user_id, book_id)

    # RAG: retrieve relevant book content
    rag_ctx = ''
    try:
        from app.services.rag_service import get_book_context
        rag_ctx = await get_book_context(db, user_id, book_id, message)
    except Exception as exc:
        logger.warning('RAG context retrieval failed: %s', exc)

    # Conversation memory summary
    memory_summary = ''
    try:
        from app.services.conversation_memory import get_or_create_summary
        memory_summary = await get_or_create_summary(db, user_id, book_id) or ''
    except Exception as exc:
        logger.warning('Memory summary retrieval failed: %s', exc)

    system_text = _build_system_prompt(
        book, annotations_ctx, rag_ctx, memory_summary,
        companion_mode=companion_mode, context=context,
    )

    messages = [SystemMessage(content=system_text)] + history
    messages.append(HumanMessage(content=message))

    llm = get_llm()
    try:
        response: AIMessage = await llm.ainvoke(messages)
        assistant_content = response.content
    except Exception as exc:
        logger.error('GLM API call failed: %s', exc)
        assistant_content = (
            "I'm having trouble connecting to my AI service right now. "
            'Please try again in a moment.'
        )

    await _save_message(db, user_id, book_id, 'user', message)
    await _save_message(db, user_id, book_id, 'assistant', assistant_content)

    return {'role': 'assistant', 'content': assistant_content}


async def stream_chat(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
) -> AsyncGenerator[str, None]:
    """Stream companion chat as SSE chunks and persist messages after."""
    book = await _load_book(db, user_id, book_id)
    annotations_ctx = await _load_annotations_context(db, user_id, book_id)
    history = await _load_history(db, user_id, book_id)

    # RAG enrichment
    rag_ctx = ''
    try:
        from app.services.rag_service import get_book_context
        rag_ctx = await get_book_context(db, user_id, book_id, message)
    except Exception as exc:
        logger.warning('RAG context retrieval failed: %s', exc)

    # Memory summary
    memory_summary = ''
    try:
        from app.services.conversation_memory import get_or_create_summary
        memory_summary = await get_or_create_summary(db, user_id, book_id) or ''
    except Exception as exc:
        logger.warning('Memory summary retrieval failed: %s', exc)

    system_text = _build_system_prompt(
        book, annotations_ctx, rag_ctx, memory_summary,
        companion_mode=companion_mode, context=context,
    )
    messages = [SystemMessage(content=system_text)] + history
    messages.append(HumanMessage(content=message))

    llm = get_llm()
    collected_parts: list[str] = []

    try:
        async for chunk in llm.astream(messages):
            token = chunk.content
            if token:
                collected_parts.append(token)
                yield f'data: {json.dumps({"content": token})}\n\n'
    except Exception as exc:
        logger.error('GLM streaming failed: %s', exc)
        fallback = (
            "I'm having trouble connecting to my AI service right now. "
            'Please try again in a moment.'
        )
        yield f'data: {json.dumps({"content": fallback})}\n\n'

    yield 'data: [DONE]\n\n'

    assistant_content = ''.join(collected_parts)
    await _save_message(db, user_id, book_id, 'user', message)
    await _save_message(db, user_id, book_id, 'assistant', assistant_content)


async def summarize(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    chapter_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Summarize a book or specific chapters."""
    book = await _load_book(db, user_id, book_id)

    prompt_parts = [
        f'Summarize the book "{book.title}" by {book.author}.',
    ]
    if chapter_ids:
        prompt_parts.append(
            f'Focus on these chapters: {", ".join(chapter_ids)}.',
        )
    prompt_parts.append(
        'Provide a clear, structured summary with key themes and takeaways.',
    )

    messages = [
        SystemMessage(content='You are a literary analysis assistant.'),
        HumanMessage(content=' '.join(prompt_parts)),
    ]

    llm = get_llm(temperature=0.3, max_tokens=3000)
    try:
        response: AIMessage = await llm.ainvoke(messages)
    except Exception as exc:
        logger.error('GLM summarize failed: %s', exc)
        return {
            'role': 'assistant',
            'content': 'Unable to generate summary right now. Please try again.',
        }

    return {'role': 'assistant', 'content': response.content}


async def explain(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    text: str,
    context: str | None = None,
) -> dict[str, Any]:
    """Explain a passage from a book."""
    book = await _load_book(db, user_id, book_id)

    prompt = (
        f'In the context of "{book.title}" by {book.author}, '
        f'explain the following passage:\n\n{text}'
    )
    if context:
        prompt += f'\n\nAdditional context: {context}'

    messages = [
        SystemMessage(
            content=(
                'You are a reading companion that helps readers understand '
                'difficult passages. Explain clearly with examples.'
            ),
        ),
        HumanMessage(content=prompt),
    ]

    llm = get_llm(temperature=0.4, max_tokens=1500)
    try:
        response: AIMessage = await llm.ainvoke(messages)
    except Exception as exc:
        logger.error('GLM explain failed: %s', exc)
        return {
            'role': 'assistant',
            'content': 'Unable to explain this passage right now. Please try again.',
        }

    return {'role': 'assistant', 'content': response.content}
