"""Output safety filter for LLM responses.

Validates LLM output before returning to users. Checks for:
- PII leakage (email, phone patterns) — redacted automatically
- Harmful content indicators — blocked with safe fallback
- Schema compliance (via Pydantic)
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections import Counter
from datetime import UTC, datetime, timedelta

logger = logging.getLogger('read-pal.output_filter')

SAFETY_FALLBACK = (
    "I'm sorry, I can't respond to that. "
    "If you're in distress, please contact a helpline."
)

# PII patterns that should NOT appear in LLM output
_PII_PATTERNS = [
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'), 'email', '[REDACTED_EMAIL]'),
    (re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'), 'phone_number', '[REDACTED_PHONE]'),
    (re.compile(r'\b\d{3}-\d{2}-\d{4}\b'), 'SSN', '[REDACTED_SSN]'),
    (re.compile(r'\b(?:\d[ -]?){13,19}\b'), 'credit_card', '[REDACTED_CC]'),
]

# Content that should be blocked
_HARMFUL_KEYWORDS = [
    'suicide', 'self-harm', 'kill yourself',
]


# ---------------------------------------------------------------------------
# Guardrail hit counters (engineering-upgrade B4)
# ---------------------------------------------------------------------------

# The "guardrail trigger rate" metric needs a counter, but the filter runs in
# sync code on the hot path — so: always bump an in-process Counter (correct
# per worker, survives nothing), and best-effort schedule a Redis day-key
# increment when an event loop is running. Redis failures are swallowed: the
# counter must never break content filtering.
_GUARDRAIL_KINDS = ('pii', 'harmful')
_GUARDRAIL_KEY_TTL_SECONDS = 8 * 86400  # keep a week of daily keys + margin

_memory_guardrail_counts: Counter[str] = Counter()

# Strong references for fire-and-forget counter tasks: asyncio keeps only a
# weak reference to bare tasks, so an unreferenced one can be garbage
# collected mid-flight and silently drop its increment.
_guardrail_tasks: set[asyncio.Task] = set()


def _guardrail_day_key(kind: str, day: datetime) -> str:
    return f"llm:guardrail:{day.strftime('%Y%m%d')}:{kind}"


def _count_guardrail_hit(kind: str) -> None:
    if kind not in _GUARDRAIL_KINDS:
        return
    _memory_guardrail_counts[_guardrail_day_key(kind, datetime.now(UTC))] += 1
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # sync context (e.g. unit tests calling filter_output directly)
    task = loop.create_task(_incr_guardrail_redis(
        _guardrail_day_key(kind, datetime.now(UTC)),
    ))
    _guardrail_tasks.add(task)
    task.add_done_callback(_guardrail_tasks.discard)


async def _incr_guardrail_redis(key: str) -> None:
    """Flush one hit to the cross-worker Redis day-key.

    The key is computed at COUNT time and passed in — recomputing inside
    the coroutine could cross midnight and pay back the wrong day. On
    SUCCESS the pending in-memory count for that key is decremented —
    the memory Counter only ever holds increments Redis hasn't accepted
    (flush failures, async gaps). ``read_guardrail_hits`` sums both sides,
    so without this payback every hit was counted twice once the async
    INCR landed (24h-review R1: metrics ran at ~2x actual).
    """
    try:
        from app.core.redis import get_redis

        r = get_redis()
        await r.incr(key)
        await r.expire(key, _GUARDRAIL_KEY_TTL_SECONDS)
    except Exception:  # noqa: BLE001 — best-effort counter, never raise
        logger.debug('guardrail counter redis increment failed', exc_info=True)
        return  # keep the in-memory count as the unflushed fallback
    if _memory_guardrail_counts[key] > 0:
        _memory_guardrail_counts[key] -= 1


async def read_guardrail_hits(*, days: int = 1) -> dict[str, int]:
    """Aggregate guardrail hits over the last ``days`` UTC days.

    Merges Redis day-keys (cross-worker truth) with this process's in-memory
    Counter (covers increments the async path hasn't flushed). Returns
    ``{'pii': n, 'harmful': n, 'total': n}``.
    """
    out: dict[str, int] = {kind: 0 for kind in _GUARDRAIL_KINDS}
    today = datetime.now(UTC)
    wanted = {
        _guardrail_day_key(kind, today - timedelta(days=offset))
        for kind in _GUARDRAIL_KINDS
        for offset in range(max(days, 1))
    }
    for key, count in _memory_guardrail_counts.items():
        if key in wanted:
            out[key.rsplit(':', 1)[-1]] += count
    try:
        from app.core.redis import get_redis

        r = get_redis()
        for key in sorted(wanted):
            value = await r.get(key)
            if value:
                kind = key.rsplit(':', 1)[-1]
                out[kind] += int(value)
    except Exception:  # noqa: BLE001 — metrics read degrades to memory-only
        logger.debug('guardrail counter redis read failed', exc_info=True)
    out['total'] = out['pii'] + out['harmful']
    return out


def _is_harmful(text: str) -> bool:
    """Return True if text contains harmful keywords (counts the hit)."""
    text_lower = text.lower()
    hit = any(kw in text_lower for kw in _HARMFUL_KEYWORDS)
    if hit:
        _count_guardrail_hit('harmful')
    return hit


def _redact_pii(text: str, *, context: str = '') -> str:
    """Replace PII patterns with redaction tokens, logging each type found."""
    hit_any = False
    for pattern, pii_type, replacement in _PII_PATTERNS:
        matches = pattern.findall(text)
        if matches:
            hit_any = True
            logger.warning(
                'PII detected in %s: type=%s, count=%d',
                context, pii_type, len(matches),
            )
            text = pattern.sub(replacement, text)
    if hit_any:
        _count_guardrail_hit('pii')
    return text


def filter_output(text: str, *, context: str = 'llm_output') -> str:
    """Filter LLM output for safety issues.

    - Redacts PII (email, phone, SSN, credit card) with placeholder tokens.
    - Blocks harmful content by returning SAFETY_FALLBACK.
    - Logs all detections for observability.
    """
    if not text:
        return text

    # Block harmful content first
    if _is_harmful(text):
        for keyword in _HARMFUL_KEYWORDS:
            if keyword in text.lower():
                logger.warning(
                    'Blocked harmful content in %s: keyword=%.30s',
                    context, keyword,
                )
                break
        return SAFETY_FALLBACK

    # Redact PII
    return _redact_pii(text, context=context)


def filter_stream_chunk(text: str, *, context: str = 'stream') -> str | None:
    """Lightweight safety filter for SSE streaming chunks.

    Returns None if the chunk should be dropped (harmful content).
    Returns the text with PII redacted if safe.
    Intended for per-chunk use during streaming without heavy processing.

    Limitation: PII patterns split across chunks (e.g. ``"555-"`` then
    ``"123-4567"``) won't match. The STREAM_FLUSH_SIZE buffer (8 chunks
    before flush) reduces but doesn't eliminate this — for full cross-chunk
    safety use :class:`StreamPIIRedactor`.
    """
    if not text:
        return text

    if _is_harmful(text):
        logger.warning('Dropped harmful stream chunk in %s', context)
        return None

    return _redact_pii(text, context=context)


class StreamPIIRedactor:
    """Cross-chunk PII redactor with a rolling overlap buffer.

    Maintains the last ``overlap_chars`` (default 30, longest PII pattern
    minus 1) of the previous chunk so patterns split across chunks match.
    The overlap is held back from output; on the next ``feed()`` call the
    new chunk is concatenated, redacted, and the safe-portion (everything
    except the new overlap) is returned.

    Usage:
        redactor = StreamPIIRedactor(context='companion_stream')
        for chunk in stream:
            safe = redactor.feed(chunk)
            if safe is not None:
                yield sse_chunk(safe)
        # On stream end:
        tail = redactor.flush()
        if tail is not None:
            yield sse_chunk(tail)
    """

    def __init__(self, *, context: str = 'stream', overlap_chars: int = 30) -> None:
        # Longest PII pattern is ~16 chars (credit card). 30 gives margin.
        self._context = context
        self._overlap_chars = overlap_chars
        self._buffer: str = ''

    def feed(self, text: str) -> str | None:
        """Append text, redact, return the safe-to-emit portion.

        Returns ``None`` if the chunk should be dropped (harmful content).
        """
        if not text:
            return ''
        if _is_harmful(text):
            logger.warning('Dropped harmful stream chunk in %s', self._context)
            return None
        # Concatenate overlap from last call + new text
        combined = self._buffer + text
        redacted = _redact_pii(combined, context=self._context)
        # Hold back the tail as overlap for next call
        if len(redacted) > self._overlap_chars:
            emit = redacted[:-self._overlap_chars]
            self._buffer = redacted[-self._overlap_chars:]
        else:
            # Not enough to safely emit — keep accumulating
            emit = ''
            self._buffer = redacted
        return emit

    def flush(self) -> str:
        """Emit any remaining overlap. Call once at stream end."""
        tail = self._buffer
        self._buffer = ''
        return tail


def validate_schema(
    data: dict | list,
    schema_class: type,
    *,
    context: str = 'llm_output',
) -> dict:
    """Validate LLM output against a Pydantic schema.

    Returns validated data on success, or empty dict on failure.
    Logs warnings for validation failures.
    """
    try:
        if isinstance(data, list):
            # Wrap list in the expected container
            result = schema_class.model_validate({'items': data})
            return result.model_dump()
        result = schema_class.model_validate(data)
        return result.model_dump()
    except (ValueError, TypeError) as exc:
        logger.warning(
            'Schema validation failed for %s: %s. Data keys: %s',
            context, exc,
            list(data.keys()) if isinstance(data, dict) else f'list({len(data)})',
        )
        return {}
