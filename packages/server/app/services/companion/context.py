"""Context loading, prompt building, and message persistence for companion."""

import asyncio
from typing import Any
from uuid import UUID

import structlog
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.prompts.templates import FRIEND_PERSONAS
from app.services.companion.constants import ANNOTATION_LIMIT, HISTORY_LIMIT
from app.utils.i18n import t
from app.utils.sanitizer import (
    sanitize_annotations,
    sanitize_chat_message,
    sanitize_user_input,
)
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.companion')


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
    persona: str | None = None,
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

    # Apply persona personality if provided
    if persona and persona in FRIEND_PERSONAS:
        prompt += '\n\n' + FRIEND_PERSONAS[persona].template

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
        logger.warning(
            'companion.chat.budget_truncated',
            truncations=', '.join(budget.truncations),
        )
    return messages


async def _prepare_context(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    persona: str | None = None,
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
            from app.services.rag import get_book_context
            return await get_book_context(db, user_id, book_id, message)
        except Exception as exc:
            logger.warning('companion.rag_failed', error=str(exc))
            return ''

    async def _get_memory() -> str:
        try:
            from app.services.conversation_memory import get_or_create_summary
            return await get_or_create_summary(db, user_id, book_id) or ''
        except Exception as exc:
            logger.warning('companion.memory_failed', error=str(exc))
            return ''

    rag_ctx, memory_summary = await asyncio.gather(_get_rag(), _get_memory())

    budget = TokenBudget()
    system_text = _build_system_prompt(
        book, annotations_ctx, rag_ctx, memory_summary,
        companion_mode=companion_mode, context=context, persona=persona,
        lang=lang, budget=budget,
    )
    return book, history, system_text, budget
