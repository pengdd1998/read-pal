"""LLM observability — structured call logging, token estimation, cost tracking."""

from __future__ import annotations

from typing import Any

import structlog

from app.config import get_settings

logger = structlog.get_logger('read-pal.llm')

# ---------------------------------------------------------------------------
# Cost estimation constants
# ---------------------------------------------------------------------------

_COST_PER_1K: dict[str, dict[str, float]] = {
    # GLM / Zhipu (free tier)
    'glm-4.7-flash': {'input': 0.0, 'output': 0.0},
    'glm-4-flash': {'input': 0.0, 'output': 0.0},
    'glm-4': {'input': 0.00007, 'output': 0.00007},
    # DeepSeek
    'deepseek-chat': {'input': 0.00007, 'output': 0.00027},
    'deepseek-reasoner': {'input': 0.00014, 'output': 0.00219},
    # Alibaba Qwen
    'qwen-turbo': {'input': 0.000033, 'output': 0.00013},
    # OpenAI
    'gpt-4o-mini': {'input': 0.00015, 'output': 0.0006},
    'gpt-4.1-nano': {'input': 0.0001, 'output': 0.0004},
    'gpt-4.1-mini': {'input': 0.0004, 'output': 0.0016},
    'gpt-4o': {'input': 0.0025, 'output': 0.01},
}

# Heuristic: chars per token for estimation when response_metadata is absent
_CHARS_PER_TOKEN = 4


def _estimate_tokens_from_chars(text: str) -> int:
    """Estimate token count from character length."""
    return max(len(text) // _CHARS_PER_TOKEN, 1)


def _extract_usage(response: Any) -> dict[str, int]:
    """Extract token usage from LLM response metadata."""
    usage: dict[str, int] = {}
    meta = getattr(response, 'response_metadata', {}) or {}
    token_usage = meta.get('token_usage', {})
    if token_usage:
        usage['prompt_tokens'] = token_usage.get('prompt_tokens', 0)
        usage['completion_tokens'] = token_usage.get('completion_tokens', 0)
        usage['total_tokens'] = token_usage.get('total_tokens', 0)
    if not usage.get('total_tokens'):
        content = getattr(response, 'content', '') or ''
        usage['completion_tokens'] = _estimate_tokens_from_chars(content)
        usage['total_tokens'] = usage['completion_tokens']
    return usage


def _estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate USD cost for a single call."""
    rates = _COST_PER_1K.get(model, {'input': 0.0001, 'output': 0.0001})
    return (
        prompt_tokens / 1000 * rates['input']
        + completion_tokens / 1000 * rates['output']
    )


def _build_trace_dict(
    *,
    request_id: str,
    model: str,
    label: str,
    latency_ms: int,
    usage: dict[str, int],
    cost: float,
    success: bool,
    fallback_used: bool,
    error_message: str | None,
    provider: str | None,
) -> dict[str, Any]:
    """Build the shared trace dict used for both logging and DB persistence."""
    return {
        'request_id': request_id,
        'model': model,
        'label': label,
        'latency_ms': latency_ms,
        'prompt_tokens': usage.get('prompt_tokens', 0),
        'completion_tokens': usage.get('completion_tokens', 0),
        'total_tokens': usage.get('total_tokens', 0),
        'estimated_cost_usd': cost,
        'success': success,
        'fallback_used': fallback_used,
        'error_message': error_message,
        'provider': provider,
    }


def _log_call(
    *,
    request_id: str,
    model: str,
    label: str,
    latency_ms: int,
    usage: dict[str, int],
    success: bool,
    fallback_used: bool = False,
    error_message: str | None = None,
    provider: str | None = None,
    user_id: str | None = None,
    book_id: str | None = None,
) -> None:
    """Structured log for every LLM call — console + DB persistence."""
    cost = _estimate_cost(
        model,
        usage.get('prompt_tokens', 0),
        usage.get('completion_tokens', 0),
    )
    trace = _build_trace_dict(
        request_id=request_id,
        model=model,
        label=label,
        latency_ms=latency_ms,
        usage=usage,
        cost=cost,
        success=success,
        fallback_used=fallback_used,
        error_message=error_message,
        provider=provider,
    )
    logger.info(
        'llm_call',
        **trace,
        estimated_cost=round(cost, 6),
        fallback=fallback_used,
        user_id=user_id,
        book_id=book_id,
    )
    if get_settings().llm_log_enabled:
        _trace_writer.add(trace)


# ---------------------------------------------------------------------------
# Trace writer — async buffered persistence to PostgreSQL
# ---------------------------------------------------------------------------

import asyncio


class _TraceWriter:
    """Buffered, fire-and-forget writer for LLM call traces."""

    MAX_BUFFER = 50
    FLUSH_INTERVAL = 5.0

    def __init__(self) -> None:
        self._buf: list[dict[str, Any]] = []
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.ensure_future(self._flush_loop())

    def cancel(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    def add(self, trace: dict[str, Any]) -> None:
        self._buf.append(trace)
        if len(self._buf) >= self.MAX_BUFFER:
            asyncio.ensure_future(self.flush())

    async def flush(self) -> int:
        async with self._lock:
            if not self._buf:
                return 0
            batch = self._buf[:self.MAX_BUFFER]
            self._buf = self._buf[self.MAX_BUFFER:]

        try:
            from app.db import async_session
            from app.models.llm_trace import LLMCallTrace

            async with async_session() as session:
                session.add_all([LLMCallTrace(**t) for t in batch])
                await session.commit()
            logger.debug('Trace flush: %d records written', len(batch))
            return len(batch)
        except Exception as exc:
            logger.warning(
                'Trace flush failed (%d records dropped)',
                len(batch),
                exc_info=True,
            )
            return 0

    async def _flush_loop(self) -> None:
        while True:
            await asyncio.sleep(self.FLUSH_INTERVAL)
            if self._buf:
                await self.flush()


_trace_writer = _TraceWriter()
