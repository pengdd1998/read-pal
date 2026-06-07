"""Main companion operations: chat, summarize, explain (streaming is in streaming.py)."""

import time
from typing import Any
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.companion.context import (
    _build_messages,
    _load_book,
    _prepare_context,
    _save_message,
)
from app.services.llm import safe_llm_call
from app.utils.i18n import t
from app.utils.sanitizer import sanitize_user_input
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.companion')


async def chat(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    persona: str | None = None,
    genre: str | None = None,
    lang: str = 'en',
) -> dict[str, Any]:
    """Run a single-turn companion chat and return the assistant response."""
    t0 = time.monotonic()
    logger.info(
        'companion.chat.started',
        companion_mode=companion_mode,
        lang=lang,
        user_id=str(user_id),
        book_id=str(book_id),
    )
    _, history, system_text, budget = await _prepare_context(
        db, user_id, book_id, message, context, companion_mode,
        persona=persona, genre=genre, lang=lang,
    )
    messages = _build_messages(system_text, history, message, budget)

    fallback_text = t('companion.fallback_error', lang)
    assistant_content = await safe_llm_call(
        messages,
        fallback=fallback_text,
        log_label='Companion chat',
        user_id=str(user_id),
        book_id=str(book_id),
    )

    await _save_message(db, user_id, book_id, 'user', message)
    await _save_message(db, user_id, book_id, 'assistant', assistant_content)

    elapsed = int((time.monotonic() - t0) * 1000)
    logger.info(
        'companion.chat.completed',
        companion_mode=companion_mode,
        response_length=len(assistant_content),
        latency_ms=elapsed,
        user_id=str(user_id),
        book_id=str(book_id),
    )

    return {'role': 'assistant', 'content': assistant_content}


def _build_summarize_messages(
    book_title: str,
    book_author: str,
    chapter_ids: list[str] | None,
    lang: str,
) -> tuple[list, TokenBudget]:
    """Build system + human messages for summarize and return (messages, budget)."""
    from langchain_core.messages import HumanMessage, SystemMessage

    prompt_parts = [
        t('companion.summarize_prompt', lang, title=book_title, author=book_author),
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
    return messages, budget


async def summarize(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    chapter_ids: list[str] | None = None,
    lang: str = 'en',
) -> dict[str, Any]:
    """Summarize a book or specific chapters."""
    t0 = time.monotonic()
    logger.info(
        'companion.summarize.started',
        chapter_count=len(chapter_ids) if chapter_ids else 0,
        lang=lang,
        user_id=str(user_id),
        book_id=str(book_id),
    )
    book = await _load_book(db, user_id, book_id)

    messages, _budget = _build_summarize_messages(
        book.title, book.author, chapter_ids, lang,
    )

    fallback_text = t('companion.summary_error', lang)
    content = await safe_llm_call(
        messages,
        fallback=fallback_text,
        log_label='Companion summarize',
        user_id=str(user_id),
        book_id=str(book_id),
    )

    elapsed = int((time.monotonic() - t0) * 1000)
    logger.info(
        'companion.summarize.completed',
        summary_length=len(content),
        latency_ms=elapsed,
        user_id=str(user_id),
        book_id=str(book_id),
    )

    return {'role': 'assistant', 'content': content}


def _build_explain_prompt(
    book_title: str,
    book_author: str,
    text: str,
    context: str | None,
    lang: str,
) -> str:
    """Build the human prompt for the explain function."""
    safe_text = sanitize_user_input(text, max_length=3000, context='explain_text')
    prompt = t(
        'companion.explain_prompt', lang,
        title=book_title, author=book_author, text=safe_text,
    )
    if context:
        safe_context = sanitize_user_input(
            context, max_length=2000, context='explain_context',
        )
        prompt += t('companion.explain_extra_context', lang, context=safe_context)
    return prompt


async def explain(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    text: str,
    context: str | None = None,
    lang: str = 'en',
) -> dict[str, Any]:
    """Explain a passage from a book."""
    t0 = time.monotonic()
    logger.info(
        'companion.explain.started',
        lang=lang,
        user_id=str(user_id),
        book_id=str(book_id),
    )
    book = await _load_book(db, user_id, book_id)

    prompt = _build_explain_prompt(book.title, book.author, text, context, lang)

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
        user_id=str(user_id),
        book_id=str(book_id),
    )

    elapsed = int((time.monotonic() - t0) * 1000)
    logger.info(
        'companion.explain.completed',
        response_length=len(content),
        latency_ms=elapsed,
        user_id=str(user_id),
        book_id=str(book_id),
    )

    return {'role': 'assistant', 'content': content}
