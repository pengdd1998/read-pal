"""LLM observability — structured call logging, token estimation, cost tracking."""

from __future__ import annotations

import os
import json
from datetime import UTC, datetime
from typing import Any

import structlog

from app.config import get_settings

logger = structlog.get_logger('read-pal.llm')

from app.services.llm.observability._core import _CHARS_PER_TOKEN, _ERROR_CATEGORIES, _classify_error, _estimate_tokens_from_chars  # noqa: E402,F401

# ---------------------------------------------------------------------------
# JSONL sink — append-only local trace channel (engineering-upgrade B1)
# ---------------------------------------------------------------------------


class _JSONLSink:
    """Append-only JSONL sink for LLM call traces.

    Gated by ``Settings.llm_trace_jsonl_path`` (empty = off). Independent of
    ``llm_log_enabled`` so ops can run the file channel even when DB
    persistence is disabled (e.g. on a machine without the trace table).

    24h-review R4: records buffer in memory and flush in ONE open/append/
    close per batch (the old per-call sync open ran on the event loop for
    every LLM call), with size-based rotation at ROTATE_BYTES so the file
    can't grow unbounded. Failures log a warning and never propagate:
    observability must not take down the call path.
    """

    ROTATE_BYTES = 50 * 1024 * 1024  # 50MB → .1 suffix, previous copy dropped
    FLUSH_EVERY = 64  # records per batched write

    def __init__(self) -> None:
        self._buf: list[str] = []

    def write(self, record: dict[str, Any]) -> None:
        try:
            path = get_settings().llm_trace_jsonl_path
        except Exception:  # noqa: BLE001 — settings read must never raise here
            return
        if not path:
            return
        record = dict(record)
        record.setdefault('ts', datetime.now(UTC).isoformat())
        self._buf.append(json.dumps(record, ensure_ascii=False, default=str))
        if len(self._buf) >= self.FLUSH_EVERY:
            self.flush(path)

    def flush(self, path: str | None = None) -> int:
        """Write buffered records; returns how many were written."""
        if not self._buf:
            return 0
        try:
            path = path or get_settings().llm_trace_jsonl_path
        except Exception:  # noqa: BLE001
            return 0
        if not path:
            self._buf.clear()  # sink disabled mid-flight: drop quietly
            return 0
        batch, self._buf = self._buf, []
        try:
            self._rotate_if_large(path)
            with open(path, 'a', encoding='utf-8') as fh:
                fh.write('\n'.join(batch) + '\n')
            return len(batch)
        except OSError:
            logger.warning('llm_trace_jsonl_write_failed', path=path, records=len(batch))
            return 0

    def _rotate_if_large(self, path: str) -> None:
        try:
            if os.path.exists(path) and os.path.getsize(path) >= self.ROTATE_BYTES:
                os.replace(path, f'{path}.1')  # keep exactly one prior generation
        except OSError:
            pass  # rotation is best-effort; the append still runs


_jsonl_sink = _JSONLSink()


def capture_llm_content(
    *,
    request_id: str,
    label: str,
    model: str,
    prompt_version: str | None,
    messages: list[Any],
    output_text: str,
    user_id: str | None = None,
    book_id: str | None = None,
) -> None:
    """Opt-in prompt/output preview capture for badcase replay (B4).

    Writes an ``event='llm_content'`` record to the JSONL sink ONLY — never
    to the DB, never to structlog (content must not land in log streams).
    Gated by ``Settings.llm_trace_capture_content`` (default False) because
    previews can contain user-authored text; truncation is enforced by
    ``llm_trace_capture_chars``.
    """
    try:
        settings = get_settings()
    except Exception:  # noqa: BLE001 — settings read must never raise here
        return
    if not settings.llm_trace_capture_content:
        return
    cap = max(int(settings.llm_trace_capture_chars), 0)
    prompt_preview = '\n'.join(
        f'[{getattr(m, "type", "?")}] {getattr(m, "content", "")}'
        for m in messages
    )[:cap]
    _jsonl_sink.write({
        'event': 'llm_content',
        'request_id': request_id,
        'label': label,
        'model': model,
        'prompt_version': prompt_version,
        'user_id': user_id,
        'book_id': book_id,
        'prompt_preview': prompt_preview,
        'output_preview': (output_text or '')[:cap],
    })


# ---------------------------------------------------------------------------
