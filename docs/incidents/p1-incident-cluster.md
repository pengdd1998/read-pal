# P1 Incident Cluster — Reliability

These are issues that caused cascading failures, hung streams, or wasted
LLM cost without producing an outage. Read before touching: retry logic,
circuit-breaker state machine, SSE keepalive, JSON parsing, context
budgeting.

---

## P1.1 — `Retry-After` header honored on 429s

**Locations**
- `packages/server/app/services/llm/retry.py:3` (and the rest of the module)

**What went wrong**
Retry logic used a fixed exponential backoff regardless of vendor signal.
On 429s, retries fired too early and triggered additional rate-limit
errors — the openai SDK exposes the `Retry-After` header, but the
code wasn't reading it.

**Why the fix works**
- `_extract_retry_after()` reads `RateLimitError.retry_after` (newer SDK)
  or falls back to `exc.response.headers['Retry-After']`.
- When present, sleeps that exact duration. When absent, falls back to
  the existing `_RATE_LIMIT_BACKOFFS = [5, 15]` schedule.
- `_MAX_BACKOFF_TOTAL_SECONDS = 30` caps total inter-retry sleep so a
  huge `Retry-After` can't blow past the call SLA.

**Regression red-flag**
- Removing the total-wait cap "to honor vendor guidance."
- Adding a new error class to the retry path without checking whether
  the SDK exposes a `Retry-After` equivalent.

---

## P1.2 — Circuit-breaker `HALF_OPEN` probe single-flight + termination guard

**Locations**
- `packages/server/app/services/llm/registry.py:195` — provider exclusion
- `packages/server/app/services/llm/provider_fallback.py:274` — `_visited` tracking
- `packages/server/app/services/llm/circuit_breaker.py:100` — `is_open` semantics

**What went wrong**
A `HALF_OPEN` provider with a probe in-flight was still returned by
`_available_providers()` (because `is_open` returned False past the
reset timeout). `allow_request()` then rejected the probe-locked
provider. The recursive cascade cycled through every provider forever
— each appeared "available" by `is_open` but rejected on probe.

**Why the fix works**
- `_available_providers()` excludes providers with `is_probe_in_flight`.
- `next_provider_after()` tracks visited providers via `_visited` set,
  guaranteeing termination even if a future change re-introduces cycles.
- `is_open` returns False past reset timeout so provider selection
  re-includes it — which then triggers `OPEN → HALF_OPEN` via
  `allow_request()`. Without this, an opened provider could stay
  excluded forever because selection never called `allow_request()`
  on it.

**Regression red-flag**
- Any change to `_available_providers()` that drops the probe-in-flight
  exclusion.
- A new provider-selection function that doesn't use `_visited`.
- Setting `is_open` to use wall-clock time without re-including the
  provider in the selection pool.

---

## P1.4 — SSE stalled-stream warning before hard timeout

**Locations**
- `packages/server/app/services/agent_service.py:30`

**What went wrong**
Stalled streams (vendor hang, network blackhole) showed no diagnostic
signal until the 120s hard timeout fired. Ops couldn't see partial
outages — users saw "spinner with no progress" for a full minute before
the fallback kicked in.

**Why the fix works**
- Emits a one-shot warning when the SSE consumer sees **only keepalives**
  for 60 seconds (4× keepalive interval of 15s).
- Tuned to 4× interval so we tolerate 3 dropped chunks before flagging.
- Warning includes `request_id`, `model`, and elapsed time — enough for
  ops to correlate with vendor dashboards.

**Regression red-flag**
- Lowering `_PRODUCER_STALL_WARN_SECONDS` below 3× keepalive interval
  (causes false positives on slow vendor responses).
- Removing the one-shot guard (causes warning spam if the producer
  stays stalled).

---

## P1.5 — JSON repair ladder applied to cached entries

**Locations**
- `packages/server/app/services/llm/safe_invoke.py:99`, `:100`

**What went wrong**
Cache reads used strict JSON parsing. Cached entries with minor
formatting issues (prose-wrapped JSON, trailing commas) written before
the repair ladder existed were treated as cache misses — triggering
fresh LLM calls and wasting latency/cost.

**Why the fix works**
- Cache reads now run through the same `_strip_markdown_fences` +
  `_repair_json` + `_validate_parsed` ladder as fresh responses.
- Older cache entries with formatting drift remain usable.
- Hit rate improved without invalidating the cache.

**Regression red-flag**
- Bypassing the repair ladder on cache reads "for performance."
- Changing the cache key shape without also clearing in-memory + Redis caches.

---

## P1.6 — Budget reserve order: must-include content before system prompt

**Locations**
- `packages/server/app/services/companion/context.py:65`

**What went wrong**
The system prompt + persona was built first and could fill the entire
token budget. Appended history + user message then pushed past the
model's context window — and the budget truncator dropped **user-facing
content** (chat history, current message) before system content.
Worst-case: the user's actual question was truncated to make room for
boilerplate.

**Why the fix works**
- `reserve()` accounts for must-include content **before** the system
  prompt is built. `reserve()` never truncates — it only consumes budget.
- The system prompt is then `add()`ed against remaining budget. If
  budget is exhausted, `add()` returns `''` — better to ship a stub
  system prompt than drop user input.
- Order: (1) chat history, (2) current user message, (3) system prompt,
  (4) persona, (5) optional RAG context.

**Regression red-flag**
- Calling `add()` on user-facing content instead of `reserve()`.
- Reordering the reserve sequence so system prompt goes first.
- Adding a new "must-include" content type without routing through
  `reserve()`.
