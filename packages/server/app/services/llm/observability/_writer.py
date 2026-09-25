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
    # P-D: content rows are wider (up to llm_trace_content_chars per side)
    # — keep the batch smaller so a flush stays one cheap transaction.
    CONTENT_MAX_BUFFER = 20
    # Engineering-upgrade follow-up: retention prune check cadence. Actual
    # deletion boundary is LLM_LOG_RETENTION_DAYS; checking every 6h (and
    # once immediately at startup, via _last_prune_monotonic starting at 0)
    # keeps the table bounded without a separate cron/worker mechanism.
    PRUNE_CHECK_INTERVAL = 6 * 3600.0

    def __init__(self) -> None:
        self._buf: list[dict[str, Any]] = []
        self._content_buf: list[dict[str, Any]] = []
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

    def add_content(self, row: dict[str, Any]) -> None:
        """P-D: buffer a raw prompt/output row for llm_trace_contents.

        Independently gated (LLM_TRACE_CONTENT_DB): a deployment that opts
        into traces but not content capture never buffers a byte. Same
        fire-and-forget contract as traces — a flush failure drops the
        batch with a warning, never raises into the LLM call path.
        """
        if not get_settings().llm_trace_content_db:
            return
        self._content_buf.append(row)
        if len(self._content_buf) >= self.CONTENT_MAX_BUFFER:
            asyncio.ensure_future(self.flush_contents())

    async def flush(self) -> int:
        async with self._lock:
            if not self._buf:
                return 0
            batch = self._buf[:self.MAX_BUFFER]
            self._buf = self._buf[self.MAX_BUFFER:]

        try:
            from sqlalchemy.exc import IntegrityError

            from app.db import async_session
            from app.models.llm_trace import LLMCallTrace
            from app.services.llm.rollup import upsert_traces

            # Risk-review 09-21: two uvicorn workers can flush into the
            # same (hour, label, provider) key in the same hour — the
            # second committer hits a composite-PK IntegrityError and the
            # whole batch (traces + rollup) rolls back. Retry once on a
            # fresh session: the re-read picks up the winner's row and the
            # merge folds on top. A second conflict loses the batch to the
            # existing except below — self-heals on nothing (traces are
            # gone), bounded at <=50 observability rows, never user data.
            for attempt in (1, 2):
                try:
                    async with db_error_guard(
                        'observability.trace_flush', batch_size=len(batch),
                    ):
                        async with async_session() as session:
                            session.add_all([LLMCallTrace(**t) for t in batch])
                            # P-C: fold the same batch into the hourly rollup
                            # in the same transaction — a rollup gap is then
                            # only possible when the trace write itself failed.
                            await upsert_traces(session, batch)
                            await session.commit()
                    logger.debug(
                        'Trace flush: %d records written (attempt %d)',
                        len(batch), attempt,
                    )
                    return len(batch)
                except IntegrityError:
                    if attempt == 2:
                        raise
                    logger.warning(
                        'Rollup PK race on flush (%d rows) — retrying once',
                        len(batch),
                    )
        except Exception:
            logger.warning(
                'Trace flush failed (%d records dropped)',
                len(batch),
                exc_info=True,
            )
            return 0

    async def flush_contents(self) -> int:
        """P-D: persist buffered content rows with ON CONFLICT DO NOTHING.

        request_id is a 12-hex per-call id (uuid4().hex[:12]) — unique in
        practice, but not guaranteed: a prefix collision (or a capture
        hook firing twice across a retry) would raise IntegrityError and
        pollute the whole batch. The dialect insert with DO NOTHING makes
        duplicates a silent no-op instead.
        """
        async with self._lock:
            if not self._content_buf:
                return 0
            batch = self._content_buf[:self.CONTENT_MAX_BUFFER]
            self._content_buf = self._content_buf[self.CONTENT_MAX_BUFFER:]

        try:
            from app.db import async_session
            from app.models.llm_trace_content import LLMTraceContent

            # Dedupe on (request_id, model) within the batch — fallback
            # chains share the request_id but carry different models
            # (0034). UUID PKs make cross-flush collisions practically
            # impossible, so no ON CONFLICT clause is needed.
            by_key: dict[tuple[str, str], dict[str, Any]] = {}
            for row in batch:
                key = (row['request_id'], row.get('model', ''))
                by_key.setdefault(key, row)
            values = list(by_key.values())

            async with db_error_guard(
                'observability.content_flush', batch_size=len(values),
            ):
                async with async_session() as session:
                    session.add_all([LLMTraceContent(**v) for v in values])
                    await session.commit()
            logger.debug('Content flush: %d rows written', len(values))
            return len(values)
        except Exception:
            logger.warning(
                'Content flush failed (%d rows dropped)',
                len(batch),
                exc_info=True,
            )
            return 0

    async def _flush_loop(self) -> None:
        while True:
            await asyncio.sleep(self.FLUSH_INTERVAL)
            if self._buf:
                await self.flush()
            if self._content_buf:
                await self.flush_contents()
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

            await self._prune_contents(factory, settings)
            return total_deleted
        except Exception:
            logger.warning('Trace prune failed', exc_info=True)
            return 0

    async def _prune_contents(self, factory: Any, settings: Any) -> None:
        """P-D: content retention rides the prune cadence with its own
        (shorter) horizon — captured raw I/O is telemetry, not data of
        record. ``<= 0`` disables (keep-forever), mirroring the trace knob.
        Failures warn and never affect the trace prune that calls this.
        """
        try:
            from sqlalchemy import delete

            from app.models.llm_trace_content import LLMTraceContent

            content_days = settings.llm_trace_content_retention_days
            content_deleted = 0
            if content_days > 0:
                content_cutoff = datetime.now(UTC) - timedelta(days=content_days)
                async with factory() as session:
                    result = await session.execute(
                        delete(LLMTraceContent).where(
                            LLMTraceContent.created_at < content_cutoff,
                        ),
                    )
                    await session.commit()
                    content_deleted = result.rowcount or 0
            if content_deleted:
                logger.info(
                    'Content prune: deleted %d rows older than %dd',
                    content_deleted, content_days,
                )
        except Exception:  # noqa: BLE001 — content prune must not affect traces
            logger.warning('Content prune failed', exc_info=True)


_trace_writer = _TraceWriter()
