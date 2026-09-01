"""Post-stream persistence + token-budget settlement.

Extracted from streaming.py (see stream_pump.py header). Runs in the
``finally`` block of the request-level orchestrator: retry-wrapped message
persistence (P0.2) and daily token-budget settle/refund with the tokens the
user actually saw.
"""

from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.companion.stream_cache import persist_stream_result
from app.utils.db import db_error_guard

logger = structlog.get_logger('read-pal.companion')


async def _persist_with_retry(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    lang: str | None = None,
) -> bool:
    """Persist streaming result with one retry. Returns True on success.

    On DBAPIError the SQLAlchemy async session enters a broken state; we
    must rollback before the next attempt (or before ``get_db`` returns the
    connection to the pool) — otherwise every subsequent statement on this
    session raises ``PendingRollbackError``.
    """
    last_exc: Exception | None = None
    for attempt in (0, 1):
        try:
            async with db_error_guard(
                'companion.stream.persist_result',
                request_id=request_id, attempt=attempt,
                user_id=str(user_id), book_id=str(book_id),
            ):
                return await persist_stream_result(
                    db, user_id, book_id, message, messages,
                    collected_parts, request_id, lang=lang,
                )
        except DBAPIError as exc:
            last_exc = exc
            logger.warning(
                'companion.stream.persist_dbapi_error',
                request_id=request_id, attempt=attempt,
                error=str(exc)[:200],
            )
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001 — best-effort rollback
                logger.warning(
                    'companion.stream.persist_rollback_failed',
                    request_id=request_id, attempt=attempt,
                )
        except OSError as exc:
            last_exc = exc
            logger.warning(
                'companion.stream.persist_oserror',
                request_id=request_id, attempt=attempt,
                error=str(exc)[:200],
            )
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001 — best-effort rollback
                pass

    logger.error(
        'companion.stream.persist_failed_final',
        request_id=request_id,
        user_id=str(user_id),
        book_id=str(book_id),
        error=str(last_exc)[:200] if last_exc else 'unknown',
    )
    return False


async def _settle_token_budget(
    user_id_str: str,
    request_id: str,
    pre_charge: int,
    token_limit: int,
    messages: list,
    collected_parts: list[str],
    billing_state: dict,
) -> None:
    """Settle the token-budget pre-charge with actual emitted tokens.

    P0.2: settle with what the user actually saw — collected_parts accumulates
    across primary + fallback, and billing_state['partial_chars'] counts any
    primary partial that was discarded before fallback ran. Empty output means
    a full refund.
    """
    if token_limit <= 0 or pre_charge <= 0:
        return
    from app.middleware.daily_llm_budget import estimate_input_tokens, _get_budget

    emitted_chars = sum(len(p) for p in collected_parts)
    emitted_chars += billing_state.get('partial_chars', 0)
    if emitted_chars > 0:
        actual_output_tokens = max(emitted_chars // 4, 1)
        actual_total = estimate_input_tokens(messages) + actual_output_tokens
        try:
            await _get_budget().settle_tokens(user_id_str, pre_charge, actual_total)
        except Exception as exc:  # noqa: BLE001 — settle best-effort
            logger.debug(
                'companion.stream.token_settle_failed',
                request_id=request_id, error=str(exc)[:200],
            )
    else:
        try:
            await _get_budget().settle_tokens(user_id_str, pre_charge, 0)
        except Exception as exc:  # noqa: BLE001 — refund best-effort
            logger.debug(
                'companion.stream.token_refund_failed',
                request_id=request_id, error=str(exc)[:200],
            )
