# P9 — Core-loop reliability cluster (2026-11-28)

> Found by the 2026-11-28 positioning review, measured live
> (`docs/weekly-plans/2026-11-28-iteration-roadmap.md`). Forty-six review
> rounds had reported production "all green" — health endpoint, data hashes,
> containers — while a real companion turn in production took 38s to its
> first token and the second question failed outright. Health says the
> process is up. Only a real turn says the companion can answer.

## P9.1 — A provider whose model the vendor retired stayed in rotation

**Found:** 2026-11-28. `mimo-v2.5` had answered `400 Unsupported model` on
every call since 2026-11-13 (last success 2026-09-26).

**Severity:** P1 — about a third of every routing pick, and 100% of tool
plans (pinned by the default feature routing), paid a failed attempt first.

**Locations**
- `packages/server/app/services/llm/tiers.py` — `is_config_error`
- `packages/server/app/services/llm/circuit_breaker.py` — `record_failure(config_error=…)`
- `packages/server/app/services/llm/provider_fallback.py`, `companion/stream_provider.py` — failure recording
- `packages/server/app/config.py` — `circuit_config_error_timeout_seconds`, `llm_feature_routing` default
- Tests: `tests/services/test_llm_tiers.py`

**What went wrong**

The breaker treats every failure alike: open after
`circuit_failure_threshold` consecutive failures, re-probe after
`circuit_reset_timeout_seconds` (30–60s). That is right for an overload and
wrong for a configuration error, which no retry fixes. The dead provider was
re-probed within a minute, failed again, and went on absorbing its routing
share for weeks. Nothing alerted: each failure was logged at error level and
then handled by the fallback.

**Why the fix works**

A 401/403, or a 400/404 that names the model, trips the breaker at once and
holds it open for ten minutes. One failed probe per cooldown instead of one
per third of the calls. A generic 400 (our own prompt too long) keeps the
ordinary behaviour — it is request-specific.

## P9.2 — The stream fallback chain could not reach the model that worked

**Found:** 2026-11-28, reproduced on a production-like local instance.

**Severity:** P1 — on the production account `glm-4.7-flash` returned 429 on
5 of 6 primary attempts while `glm-4-flash`, same key and provider, answered
every time. The chain still failed turns.

**Locations**
- `packages/server/app/services/companion/stream_fallback.py` — `fallback_candidates`, `_provider_models`, the hop loop
- `packages/server/app/services/companion/stream_cooldown.py` — per-model cooldown
- `packages/server/app/services/companion/stream_provider.py` — `_stream_llm_kwargs`, cooldown skip
- `packages/server/app/services/llm/pool.py` — `max_retries`
- `packages/server/app/services/llm/tiers.py` — `is_rate_limited`
- Tests: `tests/services/test_stream_fallback_chain.py`

**What went wrong — five gaps, each seen live**

1. The chain hopped *providers*. With one healthy provider it re-selected
   the model that had just returned 429 and failed the turn a second time.
2. The next provider contributed only its default model. Retired primary →
   next provider's default 429 → chain over, sibling never tried.
3. The openai SDK retried 429s on its own before raising: ~4s of silent
   waiting per failed attempt, before our chain could hop.
4. Nothing remembered the 429, so the next turn paid the same failed
   primary again.
5. Output is flushed in batches. A hop that died with text collected but
   never shown left that text in the saved answer.

**Why the fix works**

- The chain is a list of `(provider, model)` hops: the failed provider's
   fallback model first, then both models of each remaining provider.
- A 429 parks *that model* for 30s (a single-model deployment still tries —
  the failed attempt costs 0.2s, not a refused turn).
- Stream calls pass `max_retries=0`: the chain owns recovery.
- A hop that fails before showing anything is dropped from the saved text.

**Found on the first production canary after the fix:** the primary was
not refused that time — it accepted the request and produced nothing until
the 15s client timeout. Only a 429 parked a model, so a stalling primary was
retried on every turn. Now any failure before the first token parks the
model: 30s after a 429, five minutes after a stall. Stream requests time out
at 6s (`llm_stream_timeout_seconds`), so a stalled attempt costs 6s, not 15.

## P9.3 — Model calls on the critical path of every turn

**Found:** 2026-11-28.

**Severity:** P1 — 15–40s before the companion's first token.

**Locations**
- `packages/server/app/services/companion/streaming.py` — first frame; persistence and faithfulness check in one `gather`
- `packages/server/app/services/llm/tiers.py`, `safe_invoke.py`, `retry.py`, `pool.py` — the fast tier
- `packages/server/app/services/companion/context_enrichment.py` — expansion opt-in, `fetch_memory`
- `packages/server/app/services/conversation_memory.py` — `current_summary`, `schedule_summary_refresh`
- `packages/server/app/services/companion/tools/planner.py`, `tools/phase.py`
- `packages/server/app/services/rag/query_expansion.py`, `rag/rerank.py`
- Tests: `tests/services/test_p9_critical_path.py`, `tests/services/test_companion_tools.py::TestPlannerGate`

**What went wrong**

- The `request_id` frame was emitted after context enrichment and the tool
  phase. The SSE response — headers included — only opened once they
  finished: 15s, with nothing the client could cancel against.
- Query expansion, tool planning and the faithfulness check ran on the
  reasoning default model. "Extract keywords" with `max_tokens=100` thought
  for 14s and returned an empty string; the plan cost 8s and 673 tokens.
- Conversation-summary regeneration ran inline before the first token, on
  the default tier with the full backoff ladder, under a 20s budget. Every
  conversation past ten messages could spend that budget on a 429.
- The faithfulness check ran after persistence, and `[DONE]` waited for both.
- A rerank vendor returning 402 was re-called on every retrieval.
- The retrieval gate measures 0.951 hit@5 without query expansion; expansion
  was a model call on every turn's critical path that nothing required.

**Why the fix works**

- First frame first. The client can cancel from t≈0 and the response opens
  immediately.
- `safe_llm_call(..., tier='fast')` routes a call and its whole fallback
  chain to the provider's quick model with hidden reasoning off, no SDK
  retries and no backoff ladder. Scoped by a ContextVar — no signatures
  threaded through the chain.
- The answer stream disables hidden reasoning too (measured: 11–30s of dead
  air with it on). `LLM_STREAM_DISABLE_THINKING=false` restores it.
- The summary refresh runs in the background on its own session and serves
  the next turn; this turn uses the stored summary.
- Query expansion is opt-in (`RAG_QUERY_EXPANSION_ENABLED`) and bounded.
- Rerank pauses for 15 minutes after a non-retryable vendor answer.

**Follow-up, same day — the model planner left the critical path.** The
paragraph that stood here said the planner stays before the first token for
rule-unmatched content questions and that keeping it is a product call. It
was settled by a controlled A/B before any code moved: 22 questions on one
book's opening (19 with an answer in the text, 3 without), 2 runs each, same
prompt pipeline and answer model, the only difference being the tool phase's
output; 44 pairs graded blind against rules written down beforehand.

- What the planner added: nothing usable. 40 of 44 tool results were empty.
  The other 4 were `search_book` with `scope: library`, which returned
  chapter 1 of *another book in the reader's library* for a question about
  this one.
- Answer quality: no difference the study could tell from noise, in either
  direction. Objective fact hits 29 vs 27 of 38; blinded accuracy 4.61 vs
  4.45 and groundedness 4.68 vs 4.80 on a 1–5 scale, both 95% intervals
  spanning zero. All five switch conditions written down beforehand held.
- The price of keeping it: 1.6–4.1s before the first token on every such
  turn (production log, 7 turns), for nothing.

So the planner no longer runs for a content turn whose prompt already holds
the book's passages (`tools/phase.py`, `_llm_plan_worth_it`). It still runs
when nothing was retrieved — then the tools are the only other way to get
book text — and when the reader asks to save or memorize something, because
only a model can write a proposal (`rule_plan.proposal_intent`).
`COMPANION_TOOL_LLM_PLANNER_ENABLED=true` restores the old behaviour.

**Limits of the evidence:** one reviewer, one book's first three chapters,
`glm-4-flash` as the answer model, fresh conversations with no history. A
question retrieval cannot reach is covered by the no-passages branch, not by
the measurement.

## P9.4 — Failure text in the wrong language, and a notice rendered as answer text

**Found:** 2026-11-28 (the GB-11 mechanism dates from 2026-09-27).

**Severity:** P2.

**Locations**
- `packages/server/app/services/companion/streaming.py` — canned text follows the message language
- `packages/web/src/lib/sse.ts` — typed frames are never body text
- `packages/web/src/hooks/useStreamingChat.ts`, `types.ts` — `faithfulnessWarningCount`
- `packages/web/src/components/reading/chat/ChatMessageBubble.tsx` — the notice

**What went wrong**

- Canned stream text followed the *account* language; a Chinese question
  from an account set to English got an English failure message.
- The parser delivered any frame carrying `content` as a token. The
  faithfulness warning is typed *and* carries `content`, so "may not come
  from the book" was appended into the answer it was warning about.

**Why the fix works**

Canned text uses the message language (the rule the crisis/boundary replies
already followed). Typed frames go to `onMeta`; the warning renders as a
separate localized note under the reply.

## The deploy filled the disk (2026-11-28)

The first deploy of this fix rebuilt both images on a VPS whose root
partition — shared with postgres and minio — was already at 95%. Free space
went 2.1 GB → **0 KB** while the web image built. No damage (no ENOSPC in the
postgres, minio or api logs), but only by luck. `deploy.yml` now checks
headroom before any rebuild: below 2.5 GB it reclaims caches, and aborts
loudly if still below.

## Observability gap closed

`ops/observability/core_loop_canary.py` runs one real companion turn per
hour (`.github/workflows/canary.yml`) and pushes to ServerChan on failure:
HTTP status, first-frame time, first-token time, error frames, and a fact
from the book that the answer must contain. Its first two runs against the
pre-fix production both failed.

**Follow-up, same day.** The canary then failed a *correct* answer: asked
what Le Guin compares the aliens' leftovers to, the model said 「垃圾」 — the
preface's own word — while the question pinned 「玻璃纸」, one of its examples.
Each question now lists every correct fact, and any one of them grounds the
answer. Chasing that failure found the larger problem. The provider's default
model, `glm-4.7-flash`, had succeeded on 14 of 63 production calls in 14 days
(conversation summary 0 of 8, query expansion 3 of 12); `glm-4-flash` on 82 of
82; `mimo-v2.5` on 0 of 30. With and without the tool phase the two models
scored 9 of 23 against 24 of 24 on the canary's own questions. Production
routing was changed in the compose env, no code: `glm-4-flash` is the default,
`glm-4.7-flash` the fallback, the fast tier is pinned to `glm-4-flash`, and
`mimo` is gone. Six canary turns after the restart: 6 of 6, none on fallback,
first token 1.8–4.8s.

## Regression red flags

- A new model call added before the answer's first token. Put it on the
  fast tier, behind a deadline, or off the critical path.
- `printenv`-style config probing that prints provider JSON — it holds keys.
  Read routing from `llm_call_traces` (label × model × success).
- A test that mocks `record_failure` without `config_error=` — it hides P9.1.
- Pool keys must stay hashable (the thinking flag is a dict; keyed by `is not None`).
- `tier=` belongs on `safe_llm_call`, not on the `wait_for` wrapping it.
- An attribute the code reads off a settings mock is truthy unless pinned.
  Every new flag needs its value set in the tests that exercise the gate
  (`TestPlannerGate._run`), or the "off" branch is never the one under test.
- A canary expected-token that is one *example* of the correct answer. A check
  that fails correct answers gets ignored the day it is right. List every
  correct answer (`tests/ops/test_core_loop_canary.py`).
