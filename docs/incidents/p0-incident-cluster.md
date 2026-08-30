# P0 Incident Cluster — Production-Critical

These are incidents that caused duplicate billing, silent data loss, or
user-visible outage. Read before touching: idempotency middleware, LLM
fallback chain, SSE streaming, cross-worker coordination.

---

## P0.1 — Idempotency enforcement + mood-field prompt-injection closure

**Locations**
- `packages/server/app/config.py:194` — idempotency gate defaults ON
- `packages/server/app/services/mood_service.py:45` — mood field sanitized
- `packages/server/app/middleware/idempotency.py:24` — silent-exception paths closed
- `packages/server/app/middleware/idempotency.py:323` — `ALREADY_COMPLETED` response

**What went wrong**
Two related failures:
1. **Double-click bugs** caused duplicate LLM billing on mutation endpoints
   (companion chat, mood save). The idempotency gate existed but was opt-in;
   clients rarely attached `Idempotency-Key` headers.
2. **Mood field was a prompt-injection vector.** User-controlled input like
   `'happy\n\nIgnore previous instructions'` was interpolated verbatim into
   HumanMessage content, letting users rewrite the system prompt.

**Why the fix works**
- Idempotency defaults ON; web/mobile clients auto-attach deterministic keys.
  Duplicate requests short-circuit at the middleware before hitting the LLM.
- Mood field routes through `sanitize_book_field` (despite the name — it's
  the canonical sanitizer for any user-provided text entering a prompt)
  which wraps injection patterns in `BEGIN USER PROVIDED DATA` fencing.
- `structlog` replaced stdlib `logging` so `error=` kwargs in exception
  paths actually emit instead of silently failing.

**Regression red-flag**
- Any new mutation endpoint without idempotency middleware applied.
- Any user-controlled string interpolated into a prompt without
  `sanitize_book_field` / `sanitize_user_input`. The CI check at
  `.github/workflows/prompt-eval.yml` catches `book.title` / `book.author`
  but not arbitrary user fields — be vigilant in PR review.

---

## P0.2 — Token-billing pre-charge held across the fallback chain

**Locations**
- `packages/server/app/services/llm/observability.py:223`
- `packages/server/app/services/llm/circuit_fallback.py:69`, `:133`, `:249`
- `packages/server/app/services/companion/context_prompts.py:262`
- `packages/server/app/services/companion/streaming.py:458`, `:555`

**What went wrong**
The previous primary-failure path **refunded the pre-charge immediately**,
then the fallback attempt consumed tokens that went unbilled. Under flaky
networks with idempotent retry after partial emit, users could be
**triple-charged**: once on the refunded primary, once on the fallback,
once on the retry. A separate issue: LLM-generated `memory_summary` text
re-entering prompts was an indirect prompt-injection vector.

**Why the fix works**
- The pre-charge is held **once per logical request** across the entire
  primary + fallback chain — not per attempt. Settlement uses actual
  emitted tokens (`collected_parts` accumulates across all attempts).
- If all attempts fail before any emit, the pre-charge refunds in full.
- Memory summaries now route through `sanitize_user_input(max_length=1000)`
  before prompt interpolation, closing the re-injection vector.

**Regression red-flag**
- Any code path that calls `settle_tokens(refund=True)` before exhausting
  the fallback chain.
- Any LLM-generated text (summary, extracted entity, generated title)
  interpolated into a subsequent prompt without sanitization.
- A new attempt-style metric that double-counts `tokens_used` across
  primary + fallback.

---

## P0.3 — Cross-worker stream cancellation + heartbeat crash detection

**Locations**
- `packages/server/app/services/agent/stream_registry.py:34` — heartbeat constants (moved out of agent_service.py in the Aug-30 split)
- `packages/server/app/services/agent/stream_registry.py:64` — owner-key format
- `packages/server/app/services/agent/stream_registry.py:240` — cancel probe
- `packages/server/app/services/agent/stream_registry.py:235` — reason field
- `packages/server/app/routers/agent.py:167` — `reason` in response

**What went wrong**
Before this fix, cancel on a **crashed worker** returned `delivered=0`
(no Redis subscribers) — indistinguishable from "stream completed normally."
Clients waited the full 120s stream timeout before recovering. Silent
cancel failures left no diagnostic path. The m1 bump in this rollout
(Phase 4C) tolerates 2 missed heartbeats instead of 1; the original
fix tolerated only 1.

**Why the fix works**
- Each worker refreshes `worker_alive:{WORKER_ID}` in Redis every 5s
  (TTL=15s post-Phase-4C, was 10s).
- Cancel API probes the owning worker's heartbeat before publishing.
  Absent heartbeat → `{'cancelled': False, 'reason': 'unknown_worker'}`
  + stale owner-key cleanup.
- `reason` field distinguishes "stream not found" / "owning worker
  crashed" / "cancelled normally" so clients can recover appropriately.

**Regression red-flag**
- Any cancel path that returns `delivered` without a `reason` field.
- Any heartbeat-consuming code that doesn't handle `unknown_worker`
  distinctly from `cancelled=True`.
- Bumping `_WORKER_HEARTBEAT_INTERVAL` without proportionally bumping
  `_WORKER_HEARTBEAT_TTL` (must stay ≥ 3× interval).

---

## P0.6 — Idempotency completion marker

**Locations**
- `packages/server/app/services/agent_service.py:459` — SSE `finally` stamp
- `packages/server/app/middleware/idempotency.py:323` — `ALREADY_COMPLETED`
- `packages/server/app/routers/agent.py:111` — completion marker write

**What went wrong**
Completed streams returned `RATE_LIMIT_EXCEEDED` (HTTP 429) on replay —
the middleware couldn't tell "stream in progress" from "stream already
finished." Clients had no way to fetch cached results, so they retried
indefinitely. Misleading 429 status triggered exponential backoff that
made the user-perceived outage worse.

**Why the fix works**
- SSE generators stamp an idempotency completion marker in their `finally`
  block (using the `request` object forwarded into the generator).
- Middleware returns `ALREADY_COMPLETED` (HTTP 409) for replays of
  finished streams, with the cached result attached.
- Clients can now fetch results without retrying the LLM call.

**Regression red-flag**
- Any SSE generator that doesn't stamp the completion marker in `finally`.
- Any middleware change that collapses `ALREADY_COMPLETED` back into
  `RATE_LIMIT_EXCEEDED`.
- A new streaming endpoint added without idempotency completion semantics.
