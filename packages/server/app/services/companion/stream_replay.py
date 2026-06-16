"""Redis-backed chunk buffer for SSE stream replay (Last-Event-ID reconnect).

D2: when a client disconnects mid-stream and reconnects with a ``Last-Event-ID``
header (D1 + D4), the server needs the chunks already emitted to replay
from the offset. This module persists chunks to a Redis list keyed by
``request_id``, capped at ``MAX_CHUNKS_PER_REQUEST`` to bound memory under
heavy traffic.

Failure modes:
- Redis down on append → best-effort silent skip. The stream still works;
  reconnect replay simply won't have the older chunks (client gets a fresh
  start, not a 500).
- Redis down on get_chunks_after → returns empty list. Reconnect falls back
  to "fresh request" semantics.
- Buffer expires after ``REPLAY_TTL_SECONDS`` (10 min). Long enough for any
  reasonable reconnect window, short enough to bound Redis memory.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger('read-pal.companion')


# Redis key namespace. One list per in-flight / recently-completed stream.
_REPLAY_KEY_PREFIX = 'stream_replay:'
# TTL safety net: 10 min. Long enough for a tab switch / brief network blip
# to recover via Last-Event-ID; short enough that memory doesn't accumulate
# from idle streams that never reconnect.
REPLAY_TTL_SECONDS = 600
# Cap per-request chunk count. A typical stream is 50-300 chunks; pathological
# token-by-token streams can hit 5000. Past the cap, we drop oldest (FIFO)
# — reconnect would miss the very start of long responses, but the
# alternative is unbounded Redis memory.
MAX_CHUNKS_PER_REQUEST = 5000


def _key(request_id: str) -> str:
    return f'{_REPLAY_KEY_PREFIX}{request_id}'


async def append_chunk(request_id: str, seq: int, chunk: str) -> None:
    """Append a chunk to the replay buffer.

    ``chunk`` is the raw SSE frame (e.g. ``'data: {"content":"hi"}\\n\\n'``).
    Stored as ``'{seq}\\n{chunk}'`` so the parser can split on the first
    newline to recover (seq, chunk) — the chunk itself may contain newlines
    (multi-line SSE frames), so we only split once.

    Best-effort: Redis failures are logged at debug level so the stream
    itself never breaks because the replay layer is flaky.
    """
    try:
        from app.core.redis import get_redis
        redis = get_redis()
        key = _key(request_id)
        # Encode seq + chunk into a single list element. The chunk may
        # contain newlines, so we use ``\n`` as a one-shot separator
        # (split('\n', 1) on read).
        await redis.rpush(key, f'{seq}\n{chunk}')
        await redis.expire(key, REPLAY_TTL_SECONDS)
        # Cap: trim oldest entries when over the limit.
        current_len = await redis.llen(key)
        if current_len > MAX_CHUNKS_PER_REQUEST:
            #LTRIM keeps indices [start..stop] inclusive — drop the oldest
            # (current_len - MAX) entries from the head.
            drop = current_len - MAX_CHUNKS_PER_REQUEST
            await redis.ltrim(key, drop, -1)
            logger.warning(
                'stream_replay.trimmed',
                request_id=request_id,
                dropped=drop,
            )
    except Exception as exc:  # noqa: BLE001 — append best-effort
        logger.debug(
            'stream_replay.append_failed',
            request_id=request_id,
            error=str(exc)[:200],
        )


async def get_chunks_after(request_id: str, last_seq: int) -> list[tuple[int, str]]:
    """Return all buffered chunks with seq > ``last_seq``.

    Returns empty list when:
    - Buffer doesn't exist (already expired, or never populated)
    - Redis is unavailable

    The caller (D3 reconnect endpoint) treats empty as "fall back to fresh
    request semantics" — never as a hard error.
    """
    try:
        from app.core.redis import get_redis
        redis = get_redis()
        key = _key(request_id)
        raw = await redis.lrange(key, 0, -1)
        result: list[tuple[int, str]] = []
        for item in raw:
            if not isinstance(item, str):
                continue
            # Split once — chunk may contain newlines.
            seq_str, _, chunk = item.partition('\n')
            try:
                seq = int(seq_str)
            except ValueError:
                continue
            if seq > last_seq:
                result.append((seq, chunk))
        # Already in insertion order from lrange; no need to re-sort.
        return result
    except Exception as exc:  # noqa: BLE001 — read best-effort
        logger.debug(
            'stream_replay.read_failed',
            request_id=request_id,
            error=str(exc)[:200],
        )
        return []


async def buffer_exists(request_id: str) -> bool:
    """Return True if the replay buffer for ``request_id`` still exists.

    Used by D3 to distinguish "reconnect" (buffer exists, replay) from
    "fresh request" (buffer missing, treat as new).
    """
    try:
        from app.core.redis import get_redis
        redis = get_redis()
        existed = await redis.exists(_key(request_id))
        return bool(existed)
    except Exception:  # noqa: BLE001 — probe best-effort
        return False


def parse_last_event_id(header_value: str | None) -> tuple[str, int] | None:
    """Parse a ``Last-Event-ID`` header into ``(request_id, last_seq)``.

    Returns None when the header is absent or malformed. D3 uses this to
    decide whether the incoming request is a reconnect attempt.

    The format is ``{request_id}:{seq}`` as emitted by D1's ``sse_chunk`` /
    ``sse_metadata_event``. A missing or non-integer seq is treated as
    malformed → caller falls back to fresh-request semantics.
    """
    if not header_value or ':' not in header_value:
        return None
    request_id, _, seq_str = header_value.partition(':')
    if not request_id or not seq_str:
        return None
    try:
        seq = int(seq_str)
    except ValueError:
        return None
    if seq < 0:
        return None
    return request_id, seq


async def try_buffered_replay(
    last_event_id: str | None,
) -> list[tuple[int, str]] | None:
    """D3 reconnect entrypoint.

    Returns:
    - ``None`` when this is NOT a reconnect (header missing/malformed, or
      buffer doesn't exist) → caller falls through to normal streaming.
    - ``list`` (possibly empty) when buffer exists → caller emits buffered
      chunks + ``[DONE]``. Empty list means "client already saw everything"
      (Last-Event-ID == final seq) → just emit ``[DONE]``.

    Best-effort: a Redis failure on ``buffer_exists`` returns False → caller
    falls through. Reconnect is a secondary feature; the live stream is
    primary.
    """
    parsed = parse_last_event_id(last_event_id)
    if parsed is None:
        return None
    request_id, last_seq = parsed
    if not await buffer_exists(request_id):
        return None
    return await get_chunks_after(request_id, last_seq)
