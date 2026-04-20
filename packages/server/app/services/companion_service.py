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
from app.utils.i18n import t

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
) -> str:
    """Build the system prompt from all available context."""
    prompt_key = 'companion.socratic_prompt' if companion_mode == 'socratic' else 'companion.system_prompt'
    prompt = t(prompt_key, lang,
               title=book.title, author=book.author,
               progress=book.progress, current_page=book.current_page,
               total_pages=book.total_pages)
    if annotations_ctx:
        prompt += t('companion.annotations_context', lang, annotations=annotations_ctx)
    if rag_ctx:
        prompt += t('companion.rag_context', lang, context=rag_ctx)
    if memory_summary:
        prompt += t('companion.memory_context', lang, summary=memory_summary)
    if context:
        extra_parts: list[str] = []
        if context.get('chapterContent'):
            content = context['chapterContent'][:3000]
            extra_parts.append(t('companion.chapter_content', lang, content=content))
        if context.get('nearbyCode'):
            extra_parts.append(t('companion.nearby_code', lang, code=context['nearbyCode']))
        if context.get('bookDescription'):
            extra_parts.append(t('companion.book_description', lang, description=context['bookDescription']))
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

    system_text = _build_system_prompt(
        book, annotations_ctx, rag_ctx, memory_summary,
        companion_mode=companion_mode, context=context, lang=lang,
    )

    messages = [SystemMessage(content=system_text)] + history
    messages.append(HumanMessage(content=message))

    llm = get_llm()
    try:
        response: AIMessage = await llm.ainvoke(messages)
        assistant_content = response.content
    except Exception as exc:
        logger.error('GLM API call failed: %s', exc)
        assistant_content = t('companion.fallback_error', lang)

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
    """Stream companion chat as SSE chunks and persist messages after."""
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

    system_text = _build_system_prompt(
        book, annotations_ctx, rag_ctx, memory_summary,
        companion_mode=companion_mode, context=context, lang=lang,
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
        fallback = t('companion.fallback_error', lang)
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

    messages = [
        SystemMessage(content=t('companion.summarize_system', lang)),
        HumanMessage(content=' '.join(prompt_parts)),
    ]

    llm = get_llm(temperature=0.3, max_tokens=3000)
    try:
        response: AIMessage = await llm.ainvoke(messages)
    except Exception as exc:
        logger.error('GLM summarize failed: %s', exc)
        return {
            'role': 'assistant',
            'content': t('companion.summary_error', lang),
        }

    return {'role': 'assistant', 'content': response.content}


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

    prompt = t('companion.explain_prompt', lang, title=book.title, author=book.author, text=text)
    if context:
        prompt += t('companion.explain_extra_context', lang, context=context)

    messages = [
        SystemMessage(content=t('companion.explain_system', lang)),
        HumanMessage(content=prompt),
    ]

    llm = get_llm(temperature=0.4, max_tokens=1500)
    try:
        response: AIMessage = await llm.ainvoke(messages)
    except Exception as exc:
        logger.error('GLM explain failed: %s', exc)
        return {
            'role': 'assistant',
            'content': t('companion.explain_error', lang),
        }

    return {'role': 'assistant', 'content': response.content}
