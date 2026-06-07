"""Safety checks and streaming log persistence for companion."""

import structlog
from uuid import UUID

from app.services.companion.constants import _SAFETY_KEYWORDS

logger = structlog.get_logger('read-pal.companion')


def persist_stream_log(
    *,
    request_id: str,
    model: str,
    latency_ms: int,
    success: bool,
    error_message: str | None = None,
    user_id: UUID | None = None,
    book_id: UUID | None = None,
) -> None:
    """Persist streaming LLM call to database (fire-and-forget)."""
    try:
        from app.services.llm_log_service import fire_and_forget_log
        fire_and_forget_log(
            request_id=request_id,
            model=model,
            label='companion.stream',
            latency_ms=latency_ms,
            success=success,
            error_message=error_message,
            user_id=str(user_id) if user_id else None,
            book_id=str(book_id) if book_id else None,
        )
    except Exception as exc:
        logger.warning('companion.safety.observability_log_failed', error=str(exc)[:200])


def quick_safety_check(text: str | None) -> bool:
    """Check if text is non-empty. Logs safety keywords but does not block."""
    if not text:
        return False
    lower = text.lower()
    for kw in _SAFETY_KEYWORDS:
        if kw in lower:
            logger.warning('companion.safety_keyword_detected', keyword=kw)
    return True
