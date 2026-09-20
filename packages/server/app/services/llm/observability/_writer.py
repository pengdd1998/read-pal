"""LLM observability — structured call logging, token estimation, cost tracking."""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog

from app.config import get_settings
from app.utils.db_guard import db_error_guard

logger = structlog.get_logger('read-pal.llm')

from app.services.llm.observability._jsonl import _jsonl_sink
from app.services.llm.observability._core import _CHARS_PER_TOKEN, _ERROR_CATEGORIES, _classify_error, _estimate_tokens_from_chars  # noqa: E402,F401

# ---------------------------------------------------------------------------
# Trace writer — async buffered persistence to PostgreSQL
# ---------------------------------------------------------------------------


class _TraceWriter:
    """Buffered, fire-and-forget writer for LLM call traces."""

    MAX_BUFFER = 50
    FLUSH_INTERVAL = 5.0
    # Engineering-upgrade follow-up: retention prune check cadence. Actual
    # deletion boundary is LLM_LOG_RETENTION_DAYS; checking every 6h (and
    # once immediately at startup, via _last_prune_monotonic starting at 0)
    # keeps the table bounded without a separate cron/worker mechanism.
    PRUNE_CHECK_INTERVAL = 6 * 3600.0

    def __init__(self) -> None:
        self._buf: list[dict[str, Any]] = []
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        # Init at startup, NOT 0: 0 made the first flush tick (~5s after
        # boot) immediately DELETE every row past retention — a surprise
        # bulk delete before ops could confirm the (previously dead)
        # LLM_LOG_RETENTION_DAYS knob. One full interval of grace instead.
        self._last_prune_monotonic: float = time.monotonic()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.ensure_future(self._flush_loop())

    def cancel(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    def add(self, trace: dict[str, Any]) -> None:
        # P4.4: gating moved inside ``add`` so callers (``_log_call`` /
        # ``_log_cache_hit``) no longer need to repeat the feature-flag
        # check at every call site. Centralizing here means a future
        # change to the gate (e.g. sampling, env override) lives in one
        # place instead of two.
        if not get_settings().llm_log_enabled:
            return
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
            from app.services.llm.rollup import upsert_traces

            async with db_error_guard('observability.trace_flush', batch_size=len(batch)):
                async with async_session() as session:
                    session.add_all([LLMCallTrace(**t) for t in batch])
                    # P-C: fold the same batch into the hourly rollup in the
                    # same transaction — a rollup gap is then only possible
                    # when the trace write itself failed.
                    await upsert_traces(session, batch)
                    await session.commit()
            logger.debug('Trace flush: %d records written', len(batch))
            return len(batch)
        except Exception:
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
            self._flush_jsonl_sink()
            await self._maybe_prune()

    def _flush_jsonl_sink(self) -> None:
        """Drain the JSONL sink's buffer every flush tick.

        F1 (24h-review follow-up): the sink only auto-flushed at 64
        buffered records — a low-traffic deployment (or the forensic
        LLM_TRACE_CAPTURE_CONTENT channel) could sit under the threshold
        forever and lose up to 63 records on exit. Also called from the
        app shutdown path (main.py lifespan).
        """
        try:
            _jsonl_sink.flush()
        except Exception:  # noqa: BLE001 — never break the flush loop
            logger.warning('llm_trace_jsonl_periodic_flush_failed')

    async def _maybe_prune(
        self, session_factory: Any | None = None,
    ) -> int:
        """Delete trace rows older than ``llm_log_retention_days``.

        Previously ``LLM_LOG_RETENTION_DAYS`` had a config knob but no
        consumer — the table grew unboundedly (engineering-upgrade leftover
        #3). Runs inside the writer's flush loop: first pass fires right
        after startup, then at most every PRUNE_CHECK_INTERVAL. Retention
        <= 0 disables pruning entirely (keep-forever semantics).

        ``session_factory`` is injectable for tests (hermetic DB); defaults
        to the app sessionmaker.
        """
        now = time.monotonic()
        if now - self._last_prune_monotonic < self.PRUNE_CHECK_INTERVAL:
            return 0
        self._last_prune_monotonic = now

        settings = get_settings()
        # Respect the master switch: a deployment that opted out of trace
        # logging must not have its (historical) rows deleted either.
        if not settings.llm_log_enabled:
            return 0
        retention_days = settings.llm_log_retention_days
        if retention_days <= 0:
            return 0
        cutoff = datetime.now(UTC) - timedelta(days=retention_days)

        try:
            from sqlalchemy import delete, select

            from app.db import async_session
            from app.models.llm_trace import LLMCallTrace

            factory = session_factory or async_session
            # Batched DELETE: the table grew unboundedly while the knob was
            # dead — an unbatched first sweep would hold one long transaction
            # (locks + WAL bloat). 5k rows per statement keeps each cheap.
            batch_limit = 5000
            total_deleted = 0
            while True:
                async with db_error_guard('observability.trace_prune'):
                    async with factory() as session:
                        stale_ids = (await session.execute(
                            select(LLMCallTrace.id)
                            .where(LLMCallTrace.created_at < cutoff)
                            .order_by(LLMCallTrace.created_at)
                            .limit(batch_limit),
                        )).scalars().all()
                        if not stale_ids:
                            break
                        result = await session.execute(
                            delete(LLMCallTrace).where(LLMCallTrace.id.in_(stale_ids)),
                        )
                        await session.commit()
                        total_deleted += result.rowcount or 0
                if len(stale_ids) < batch_limit:
                    break
            if total_deleted:
                logger.info('Trace prune: deleted %d rows older than %dd', total_deleted, retention_days)

            # P-C: rollup retention rides the same cadence — derived data,
            # fixed 90d horizon (independent of the trace retention knob:
            # rollup exists precisely to outlive raw traces).
            try:
                from app.services.llm.rollup import prune_rollup

                async with factory() as session:
                    pruned = await prune_rollup(session)
                if pruned:
                    logger.info('Rollup prune: deleted %d rows older than 90d', pruned)
            except Exception:  # noqa: BLE001 — rollup prune must not affect traces
                logger.warning('Rollup prune failed', exc_info=True)
            return total_deleted
        except Exception:
            logger.warning('Trace prune failed', exc_info=True)
            return 0


_trace_writer = _TraceWriter()
