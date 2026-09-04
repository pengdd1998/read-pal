"""Context loading, prompt building, and message persistence for companion.

This module re-exports helpers from sub-modules for backward compatibility
and provides the main ``_prepare_context`` orchestration function.
"""

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
)
from app.services.companion.context_loaders import save_message as _save_message  # noqa: F401 — re-exported for orchestrator
from app.services.companion.context_prompts import (
    build_messages as _build_messages,  # noqa: F401 — re-exported for orchestrator
    build_system_prompt as _build_system_prompt,
)
from app.services.companion.query_classifier import classify_query
from app.utils.i18n import DEFAULT_LANGUAGE, get_user_interaction_style
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
    """Load chat context, returning (book, history, system_text, budget).

    Loads are SEQUENTIAL: the previous asyncio.gather pairs raced the
    shared AsyncSession's connection checkout (same class as the dashboard
    partials bug fixed 2026-09-04) on every single chat message. Phase
    order is preserved — classify needs history; rag/memory need the
    classification.
    """
    book = await _load_book(db, user_id, book_id)
    annotations_ctx = await _load_annotations_context(db, user_id, book_id)
    history = await _load_history(db, user_id, book_id)

    history_texts = [m.content for m in history[-6:]]
    classification = classify_query(message, history_texts)

    rag_ctx = await _fetch_rag(db, user_id, book_id, message, history_texts, classification)
    memory_summary = await _fetch_memory(db, user_id, book_id)

    # Interaction frequency (settings 互动频率) — stored-but-dead until
    # this consumer existed (2026-09-04).
    interaction = await get_user_interaction_style(db, user_id)

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
        genre=genre, lang=lang, budget=budget, interaction=interaction,
    )
    return book, history, system_text, budget
