# P4 Refactor Log — Code Quality Extractions

Unlike the P0/P1/P3 clusters (which document past production incidents),
P4 tags record DRY extractions and observability improvements. They're
kept here as a historical reference so the next contributor understands
**why** the code is shaped the way it is — and doesn't accidentally
revert an extraction.

---

## P4.1 — Trace-writer flush on shutdown + regression baseline persistence

**Locations**
- `packages/server/app/main.py:108` — flush on shutdown
- `packages/server/app/eval/regression_baseline.py:1` — module-level docstring

**What was wrong**
- Buffered LLM traces (up to 50 in the write queue) were lost on every
  clean deploy/restart — observability gaps of 5–10 minutes per deploy.
- No regression baseline meant prompt/model changes couldn't be
  attributed to specific test failures. Regressions went undetected
  until user reports.

**Why the fix works**
- Trace writer hooks into FastAPI's `lifespan` shutdown event and
  flushes the buffer before process exit.
- `regression_baseline.json` is checked into git. Each eval run
  classifies results as PASS/FAIL/REGRESSION/IMPROVEMENT/NEW and
  blocks merge on REGRESSION.

**Regression red-flag**
- Removing the lifespan shutdown hook.
- Treating `regression_baseline.json` as disposable (regenerating it
  on every run defeats the purpose).

---

## P4.2 — Observability: error classification + cache-hit trace rows

**Locations**
- `packages/server/app/services/llm/observability.py:40`
- `packages/server/app/services/llm/observability.py:225`
- `packages/server/app/services/llm/observability.py:281`
- `packages/server/app/services/llm/observability.py:342`

**What was wrong**
- Error classification used **substring matching on error messages**.
  Brittle against vendor wording changes — a GLM message update could
  silently reclassify all errors as `unknown`.
- Cache hits produced **zero trace output**. Cache hit rate was
  uncomputable; "free" requests were invisible in cost dashboards.

**Why the fix works**
- `error_type` is a persisted DB column with stable categories.
  `_classify_error()` uses `isinstance` checks against SDK exception
  types (APIConnectionError, RateLimitError, etc.) — robust against
  message wording.
- Cache hits emit trace rows with `cache_hit=True`, `tokens=0`,
  `cost=0`, `model='cached'`. Cached and fresh responses share the
  same analytics surface.

**Regression red-flag**
- Adding new error categories by string-matching message text.
- Skipping trace emission for cache hits.
- Renaming `error_type` values without a DB migration.

---

## P4.4 — DRY extractions (7 occurrences — historical reference)

**Representative location**: `packages/server/app/services/agent_service.py:72`

**Other locations**: `agent_service.py:82`, `safe_invoke.py` (multiple),
`retry.py:133`, `stream_cache.py:16`/`:22`, `daily_llm_budget.py:34`/`:41`,
`idempotency.py:21`/`:211`.

**What was wrong**
Repeated inline string/format constructions like
`f'{_CANCEL_CHANNEL_PREFIX}{owner_worker_id}'` appeared in 4+ places.
Any change to the prefix format would silently drift across call sites,
breaking cross-worker cancel coordination (the P0.3 contract).

**Why the fix works**
Each repeated pattern extracted to a single function:
- `_cancel_channel_for(worker_id)` — channel-name format
- `_stream_owner_key(request_id)` — owner-key format
- `_worker_alive_key(worker_id)` — heartbeat-key format
- etc.

Single source of truth prevents drift.

**Regression red-flag**
- Inlining any of these formats to "simplify."
- Adding a new Redis-key format without extracting it to a helper when
  it appears in 2+ places.

---

## Why keep P4 in the incident archive?

P4 tags don't represent production outages, but they encode **architectural
decisions** that are easy to accidentally revert. A future contributor
looking at `_cancel_channel_for()` might think "why is this a one-line
function?" — this entry answers that question and warns against
inlining it.
