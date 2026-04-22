"""Reading companion agent — AI chat, summarization, explanation, and tools."""

import json
import logging
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.services.llm import circuit, get_llm, safe_llm_call
from app.utils.i18n import t
from app.utils.sanitizer import sanitize_chat_message, sanitize_annotations, sanitize_user_input
from app.utils.token_budget import TokenBudget
from app.utils.output_filter import filter_output

logger = logging.getLogger('read-pal.companion')

HISTORY_LIMIT = 20
ANNOTATION_LIMIT = 10


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
    book = await _load_book(db, user_id, book_id)
    annotations_ctx = await _load_annotations_context(db, user_id, book_id)
    history = await _load_history(db, user_id, book_id)

    rag_ctx = ''
    try:
        from app.services.rag_service import get_book_context
        rag_ctx = await get_book_context(db, user_id, book_id, message)
    except Exception as exc:
        logger.warning('RAG context retrieval failed: %s', exc)

    memory_summary = ''
    try:
        from app.services.conversation_memory import get_or_create_summary
        memory_summary = await get_or_create_summary(db, user_id, book_id) or ''
    except Exception as exc:
        logger.warning('Memory summary retrieval failed: %s', exc)

    budget = TokenBudget()
    system_text = _build_system_prompt(
        book, annotations_ctx, rag_ctx, memory_summary,
        companion_mode=companion_mode, context=context, lang=lang,
        budget=budget,
    )

    sanitized_message = sanitize_chat_message(message)
    messages = [SystemMessage(content=system_text)] + history
    messages.append(HumanMessage(content=sanitized_message))

    if budget.truncations:
        logger.warning('Companion chat budget truncations: %s', ', '.join(budget.truncations))

    fallback_text = t('companion.fallback_error', lang)
    assistant_content = await safe_llm_call(
        messages,
        fallback=fallback_text,
        log_label='Companion chat',
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
    lang: str = 'en',
) -> AsyncGenerator[str, None]:
    """Stream companion chat as SSE chunks with circuit breaker + observability."""
    from app.config import get_settings

    book = await _load_book(db, user_id, book_id)
    annotations_ctx = await _load_annotations_context(db, user_id, book_id)
    history = await _load_history(db, user_id, book_id)

    rag_ctx = ''
    try:
        from app.services.rag_service import get_book_context
        rag_ctx = await get_book_context(db, user_id, book_id, message)
    except Exception as exc:
        logger.warning('RAG context retrieval failed: %s', exc)

    memory_summary = ''
    try:
        from app.services.conversation_memory import get_or_create_summary
        memory_summary = await get_or_create_summary(db, user_id, book_id) or ''
    except Exception as exc:
        logger.warning('Memory summary retrieval failed: %s', exc)

    budget = TokenBudget()
    system_text = _build_system_prompt(
        book, annotations_ctx, rag_ctx, memory_summary,
        companion_mode=companion_mode, context=context, lang=lang,
        budget=budget,
    )

    sanitized_message = sanitize_chat_message(message)
    messages = [SystemMessage(content=system_text)] + history
    messages.append(HumanMessage(content=sanitized_message))

    if budget.truncations:
        logger.warning('Companion stream budget truncations: %s', ', '.join(budget.truncations))

    collected_parts: list[str] = []
    request_id = uuid.uuid4().hex[:12]
    start_time = time.monotonic()
    settings = get_settings()
    model_used = settings.default_model

    # Shared circuit breaker gate
    if not await circuit.allow_request():
        logger.warning('Companion stream %s blocked by circuit breaker', request_id)
        fallback = t('companion.fallback_error', lang)
        yield f'data: {json.dumps({"content": fallback})}\n\n'
    else:
        try:
            llm = get_llm()
            async for chunk in llm.astream(messages):
                token = chunk.content
                if token:
                    collected_parts.append(token)
                    yield f'data: {json.dumps({"content": token})}\n\n'
            await circuit.record_success()
            latency_ms = int((time.monotonic() - start_time) * 1000)
            logger.info(
                'LLM_STREAM req=%s model=%s label=Companion_stream latency=%dms '
                'chunks=%d success=True',
                request_id, model_used, latency_ms, len(collected_parts),
            )
        except Exception as exc:
            latency_ms = int((time.monotonic() - start_time) * 1000)
            logger.error(
                'LLM_STREAM req=%s model=%s label=Companion_stream latency=%dms '
                'success=False error=%s',
                request_id, model_used, latency_ms, exc,
            )
            await circuit.record_failure()
            # Try fallback model
            try:
                fallback_model = settings.fallback_model
                logger.info('Companion stream %s retrying with fallback %s', request_id, fallback_model)
                llm_fb = get_llm(model=fallback_model)
                async for chunk in llm_fb.astream(messages):
                    token = chunk.content
                    if token:
                        collected_parts.append(token)
                        yield f'data: {json.dumps({"content": token})}\n\n'
                await circuit.record_success()
                logger.info(
                    'LLM_STREAM req=%s model=%s label=Companion_stream fallback=True success=True',
                    request_id, fallback_model,
                )
            except Exception as fb_exc:
                logger.error('Companion stream %s fallback also failed: %s', request_id, fb_exc)
                await circuit.record_failure()
                fallback = t('companion.fallback_error', lang)
                yield f'data: {json.dumps({"content": fallback})}\n\n'

    yield 'data: [DONE]\n\n'

    assistant_content = ''.join(collected_parts)
    if assistant_content:
        assistant_content = filter_output(assistant_content, context='companion_stream')
    await _save_message(db, user_id, book_id, 'user', message)
    if assistant_content:
        await _save_message(db, user_id, book_id, 'assistant', assistant_content)
    else:
        logger.warning('Stream %s produced empty response for book %s — skipping save', request_id, book_id)


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
