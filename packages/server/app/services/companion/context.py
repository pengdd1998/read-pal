"""Context loading, prompt building, and message persistence for companion.

This module re-exports helpers from sub-modules for backward compatibility
and provides the main ``_prepare_context`` orchestration function.
"""

import asyncio
from uuid import UUID

import structlog
from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.services.companion.context_enrichment import (
    fetch_memory as _fetch_memory,
    fetch_rag as _fetch_rag,
)
from app.services.companion.context_loaders import (
    load_annotations_context as _load_annotations_context,
    load_book as _load_book,
    load_history as _load_history,
    save_message as _save_message,
)
from app.services.companion.context_prompts import (
    build_extra_context_parts as _build_extra_context_parts,
    build_messages as _build_messages,
    build_system_prompt as _build_system_prompt,
)
from app.services.companion.query_classifier import classify_query
from app.utils.i18n import DEFAULT_LANGUAGE
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.companion')


async def _prepare_context(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    persona: str | None = None,
    genre: str | None = None,
    lang: str = DEFAULT_LANGUAGE,
) -> tuple[Book, list[HumanMessage | AIMessage], str, TokenBudget]:
    """Load all chat context in parallel, returning (book, history, system_text, budget)."""
    book, annotations_ctx, history = await asyncio.gather(
        _load_book(db, user_id, book_id),
        _load_annotations_context(db, user_id, book_id),
        _load_history(db, user_id, book_id),
    )

    history_texts = [m.content for m in history[-6:]]
    classification = classify_query(message, history_texts)

    rag_ctx, memory_summary = await asyncio.gather(
        _fetch_rag(db, user_id, book_id, message, history_texts, classification),
        _fetch_memory(db, user_id, book_id),
    )

    budget = TokenBudget()

    # P1.6: reserve slots for must-include content (history + user message)
    # BEFORE the system prompt is built. Without this, system_prompt+persona
    # can fill the entire budget and the appended history+user_message push
    # the total request past the model's context window — the failure mode
    # M7 flagged. reserve() (vs add()) never truncates: dropping user input
    # or chat history is worse than shipping a stub system prompt.
    for msg in history:
        # langchain message content can be str or a multimodal list; coerce
        # to str so estimate_tokens has a stable input shape.
        budget.reserve(str(msg.content), 'history')
    budget.reserve(message, 'user_message')

    system_text = _build_system_prompt(
        book, annotations_ctx, rag_ctx, memory_summary,
        companion_mode=companion_mode, context=context, persona=persona,
        genre=genre, lang=lang, budget=budget,
    )
    return book, history, system_text, budget
