"""RAG and memory enrichment for companion context."""

import asyncio
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.companion.query_classifier import refine_rag_query

logger = structlog.get_logger('read-pal.companion')

# RAG fetch parameters keyed by query classification
RAG_PARAMS: dict[str, dict[str, int]] = {
    'content': {'top_k': 5, 'max_chars': 5000},
    'general': {'top_k': 2, 'max_chars': 1500},
}

# Summary regeneration rides INLINE before the companion answer can be
# composed; an unbounded budget let a 429-storm summary call block the
# first token for 65s+ (2026-09-02 log evidence, request 18cc10c0e725).
# Cap it: past the budget, answer without the summary this turn — the
# summary stays unregenerated and the next turn retries, so it self-heals.
SUMMARY_BUDGET_S = 20.0


async def fetch_rag(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    history_texts: list[str],
    classification: str,
) -> str:
    """Fetch RAG context based on query classification."""
    if classification == 'skip':
        return ''
    try:
        from app.services.rag import get_book_context

        rag_query = refine_rag_query(message, history_texts)
        params = RAG_PARAMS.get(classification, RAG_PARAMS['general'])
        return await get_book_context(
            db, user_id, book_id, rag_query,
            top_k=params['top_k'], max_chars=params['max_chars'],
        )
    except (ValueError, RuntimeError, ConnectionError) as exc:
        logger.warning('companion.rag_failed', error=str(exc))
        return ''


async def fetch_memory(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> str:
    """Fetch conversation memory summary (budgeted — never blocks first token)."""
    try:
        from app.services.conversation_memory import get_or_create_summary
        return await asyncio.wait_for(
            get_or_create_summary(db, user_id, book_id),
            timeout=SUMMARY_BUDGET_S,
        ) or ''
    except TimeoutError:
        # Cancellation lands mid-LLM-call in the common case (the write
        # happens at the end of generation), so the shared request session
        # is untouched and the next turn regenerates the summary.
        logger.warning(
            'companion.memory_summary_budget_exceeded',
            budget_s=SUMMARY_BUDGET_S,
            user_id=str(user_id),
            book_id=str(book_id),
        )
        return ''
    except (ValueError, RuntimeError) as exc:
        logger.warning('companion.memory_failed', error=str(exc))
        return ''
