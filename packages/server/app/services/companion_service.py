"""Reading companion agent — AI chat, summarization, explanation, and tools."""

import asyncio
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
from app.services.llm import safe_llm_call, stream_with_circuit
from app.utils.i18n import t
from app.utils.sanitizer import sanitize_chat_message, sanitize_annotations, sanitize_user_input
from app.utils.token_budget import TokenBudget
from app.utils.output_filter import filter_output, filter_stream_chunk

logger = logging.getLogger('read-pal.companion')

HISTORY_LIMIT = 20
ANNOTATION_LIMIT = 10
STREAM_FLUSH_SIZE = 5  # Check every N tokens for streaming safety

# Safety keywords for logging (not blocking)
_SAFETY_KEYWORDS = ['suicide', 'self-harm', 'kill myself']


def _quick_safety_check(text: str | None) -> bool:
    """Check if text is non-empty. Logs safety keywords but does not block."""
    if not text:
        return False
    lower = text.lower()
    for kw in _SAFETY_KEYWORDS:
        if kw in lower:
            logger.warning('Safety keyword detected in stream buffer: %s', kw)
    return True


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
        raise ValueError(t('errors.book_not_found'))
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
    lang: str = 'en',
    budget: TokenBudget | None = None,
) -> str:
    """Build the system prompt from all available context with token budgeting."""
    prompt_key = 'companion.socratic_prompt' if companion_mode == 'socratic' else 'companion.system_prompt'
    prompt = t(prompt_key, lang,
               title=book.title, author=book.author,
               progress=book.progress, current_page=book.current_page,
               total_pages=book.total_pages)
    if annotations_ctx:
        safe_annotations = sanitize_annotations(annotations_ctx)
        prompt += t('companion.annotations_context', lang, annotations=safe_annotations)
    if rag_ctx:
        safe_rag = sanitize_user_input(rag_ctx, max_length=3000, context='rag_context')
        prompt += t('companion.rag_context', lang, context=safe_rag)
    if memory_summary:
        prompt += t('companion.memory_context', lang, summary=memory_summary)
    if context:
        extra_parts: list[str] = []
        if context.get('chapterContent'):
            content = sanitize_user_input(context['chapterContent'], max_length=3000, context='chapter_content')
            extra_parts.append(t('companion.chapter_content', lang, content=content))
        if context.get('nearbyCode'):
            safe_code = sanitize_user_input(context.get('nearbyCode', ''), max_length=2000, context='nearby_code')
            extra_parts.append(t('companion.nearby_code', lang, code=safe_code))
        if context.get('bookDescription'):
            safe_desc = sanitize_user_input(context.get('bookDescription', ''), max_length=1000, context='book_description')
            extra_parts.append(t('companion.book_description', lang, description=safe_desc))
        if extra_parts:
            prompt += '\n\n' + '\n\n'.join(extra_parts)

    # Enforce token budget
    if budget:
        prompt = budget.add(prompt, 'system_prompt')

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


async def _prepare_context(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    lang: str = 'en',
) -> tuple[Book, list[HumanMessage | AIMessage], str, TokenBudget]:
    """Load all chat context in parallel, returning (book, history, system_text, budget)."""
    book, annotations_ctx, history = await asyncio.gather(
        _load_book(db, user_id, book_id),
        _load_annotations_context(db, user_id, book_id),
        _load_history(db, user_id, book_id),
    )

    async def _get_rag() -> str:
        try:
            from app.services.rag_service import get_book_context
            return await get_book_context(db, user_id, book_id, message)
        except Exception as exc:
            logger.warning('RAG context retrieval failed: %s', exc)
            return ''

    async def _get_memory() -> str:
        try:
            from app.services.conversation_memory import get_or_create_summary
            return await get_or_create_summary(db, user_id, book_id) or ''
        except Exception as exc:
            logger.warning('Memory summary retrieval failed: %s', exc)
            return ''

    rag_ctx, memory_summary = await asyncio.gather(_get_rag(), _get_memory())

    budget = TokenBudget()
    system_text = _build_system_prompt(
        book, annotations_ctx, rag_ctx, memory_summary,
        companion_mode=companion_mode, context=context, lang=lang,
        budget=budget,
    )
    return book, history, system_text, budget


def _build_messages(
    system_text: str,
    history: list[HumanMessage | AIMessage],
    message: str,
    budget: TokenBudget,
) -> list[SystemMessage | HumanMessage | AIMessage]:
    """Build the LLM message list from system prompt, history, and user message."""
    sanitized_message = sanitize_chat_message(message)
    messages = [SystemMessage(content=system_text)] + history
    messages.append(HumanMessage(content=sanitized_message))
    if budget.truncations:
        logger.warning('Companion chat budget truncations: %s', ', '.join(budget.truncations))
    return messages


async def chat(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    lang: str = 'en',
) -> dict[str, Any]:
    """Run a single-turn companion chat and return the assistant response."""
    _, history, system_text, budget = await _prepare_context(
        db, user_id, book_id, message, context, companion_mode, lang,
    )
    messages = _build_messages(system_text, history, message, budget)

    fallback_text = t('companion.fallback_error', lang)
    assistant_content = await safe_llm_call(
        messages,
        fallback=fallback_text,
        log_label='Companion chat',
    )

    await _save_message(db, user_id, book_id, 'user', message)
    await _save_message(db, user_id, book_id, 'assistant', assistant_content)

    return {'role': 'assistant', 'content': assistant_content}


async def _save_partial_message(
    user_id: UUID,
    book_id: UUID,
    role: str,
    content: str,
) -> None:
    """Persist a message using an independent DB session.

    Used in ``finally`` blocks so the save succeeds even when the
    request-scoped session has been invalidated by a client disconnect.
    """
    from app.db import async_session

    async with async_session() as session:
        try:
            await _save_message(session, user_id, book_id, role, content)
            await session.commit()
        except Exception as exc:
            logger.error(
                'Failed to save %s message for book %s: %s', role, book_id, exc,
            )
            await session.rollback()


async def stream_chat(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    lang: str = 'en',
) -> AsyncGenerator[str, None]:
    """Stream companion chat as SSE chunks using the shared LLM streaming infrastructure."""
    _, history, system_text, budget = await _prepare_context(
        db, user_id, book_id, message, context, companion_mode, lang,
    )
    messages = _build_messages(system_text, history, message, budget)

    if budget.truncations:
        logger.warning('Companion stream budget truncations: %s', ', '.join(budget.truncations))

    # Save the user message BEFORE streaming starts
    await _save_message(db, user_id, book_id, 'user', message)

    collected_parts: list[str] = []
    stream_completed_normally = False

    try:
        async for event_type, content in stream_with_circuit(
            messages,
            log_label='Companion_stream',
            flush_size=STREAM_FLUSH_SIZE,
            filter_fn=filter_stream_chunk,
        ):
            if event_type == 'token':
                collected_parts.append(content)
                yield f'data: {json.dumps({"content": content})}\n\n'
            elif event_type == 'error':
                fallback = t('companion.fallback_error', lang)
                yield f'data: {json.dumps({"content": fallback})}\n\n'
            elif event_type == 'done':
                yield 'data: [DONE]\n\n'

        stream_completed_normally = True

        # Save the assistant message using the request-scoped session
        assistant_content = ''.join(collected_parts)
        if assistant_content:
            assistant_content = filter_output(assistant_content, context='companion_stream')
            await _save_message(db, user_id, book_id, 'assistant', assistant_content)
        else:
            logger.warning('Stream produced empty response for book %s — skipping save', book_id)

    except GeneratorExit:
        # Client disconnected mid-stream — save partial content with independent session
        logger.warning(
            'Stream interrupted (client disconnect) after %d chunks for book %s',
            len(collected_parts), book_id,
        )
        partial_content = ''.join(collected_parts)
        if partial_content:
            partial_content = filter_output(partial_content, context='companion_stream')
            await _save_partial_message(user_id, book_id, 'assistant', partial_content)
        raise

    finally:
        # Safety net: save partial content if stream didn't complete normally
        if not stream_completed_normally and collected_parts:
            partial_content = ''.join(collected_parts)
            if partial_content:
                partial_content = filter_output(partial_content, context='companion_stream')
                await _save_partial_message(user_id, book_id, 'assistant', partial_content)


async def summarize(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    chapter_ids: list[str] | None = None,
    lang: str = 'en',
) -> dict[str, Any]:
    """Summarize a book or specific chapters."""
    book = await _load_book(db, user_id, book_id)

    prompt_parts = [
        t('companion.summarize_prompt', lang, title=book.title, author=book.author),
    ]
    if chapter_ids:
        prompt_parts.append(
            t('companion.summarize_chapters', lang, chapters=', '.join(chapter_ids)),
        )
    prompt_parts.append(t('companion.summarize_instruction', lang))

    budget = TokenBudget()
    system_msg = budget.add(t('companion.summarize_system', lang), 'summarize_system')
    human_msg = budget.add(' '.join(prompt_parts), 'summarize_human')

    messages = [
        SystemMessage(content=system_msg),
        HumanMessage(content=human_msg),
    ]

    fallback_text = t('companion.summary_error', lang)
    content = await safe_llm_call(
        messages,
        fallback=fallback_text,
        log_label='Companion summarize',
    )

    return {'role': 'assistant', 'content': content}


async def explain(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    text: str,
    context: str | None = None,
    lang: str = 'en',
) -> dict[str, Any]:
    """Explain a passage from a book."""
    book = await _load_book(db, user_id, book_id)

    safe_text = sanitize_user_input(text, max_length=3000, context='explain_text')
    prompt = t('companion.explain_prompt', lang, title=book.title, author=book.author, text=safe_text)
    if context:
        safe_context = sanitize_user_input(context, max_length=2000, context='explain_context')
        prompt += t('companion.explain_extra_context', lang, context=safe_context)

    budget = TokenBudget()
    system_msg = budget.add(t('companion.explain_system', lang), 'explain_system')

    messages = [
        SystemMessage(content=system_msg),
        HumanMessage(content=prompt),
    ]

    fallback_text = t('companion.explain_error', lang)
    content = await safe_llm_call(
        messages,
        fallback=fallback_text,
        log_label='Companion explain',
    )

    return {'role': 'assistant', 'content': content}
