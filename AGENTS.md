# AGENTS.md — read-pal navigation map

> Source-of-truth navigation for AI assistants (Claude Code, Cursor, Copilot)
> and human contributors. Map, not super-prompt — progressive disclosure.
> Keep under 250 lines (grew past the old 150 target as gates
> multiplied; prune by sinking handbook-style sections before adding new
> ones). Update inline P-tag references via
> `docs/incidents/` first, then reflect here.

## What this is

AI reading companion. **FastAPI** backend at `packages/server/`, **Next.js**
web at `packages/web/`, **Expo** mobile at `packages/mobile/`, shared TS at
`packages/shared/`. Every LLM call routes through `app/services/llm/`.
Prompts are versioned dataclasses. Postgres + Redis + S3-compatible object
store.

## Architecture map (file:line anchors — read before editing)

**LLM service boundary** (every vendor call funnels here):
- `packages/server/app/services/llm/__init__.py:1` — public API re-exports
- `packages/server/app/services/llm/safe_invoke.py:1` — circuit + retry + fallback + cache
- `packages/server/app/services/llm/circuit_breaker.py:23` — CLOSED/OPEN/HALF_OPEN
- `packages/server/app/services/llm/registry.py:25` — per-provider TPM/RPM
- `packages/server/app/services/llm/retry.py:60` — `Retry-After` + backoff cap
- `packages/server/app/services/llm/provider_fallback.py:1` — multi-provider chain

**Streaming + cancellation**:
- `packages/server/app/services/agent/stream_registry.py:34` — heartbeat constants (P0.3)
- `packages/server/app/services/agent/stream_registry.py:173` — `register_stream`
- `packages/server/app/services/agent_service.py:1` — SSE producer/consumer + keepalive (re-exports registry API)
- `packages/server/app/services/companion/stream_pump.py:28` — chunk loop + cancel
- `packages/server/app/services/companion/streaming.py:1` — request-level orchestration (budget pre-charge, fallback, persist)

**Prompts + eval**:
- `packages/server/app/prompts/base.py:27` — `PromptTemplate` dataclass
- `packages/server/app/eval/eval_runner.py:1` — golden dataset runner (mock + live)
- `packages/server/app/eval/regression_baseline.py:1` — PASS/FAIL/REGRESSION diff
- `packages/server/app/eval/judges.py:1` — L2 LLM-as-judge rubric (anti-sycophancy; explicit `--judge` only, never in CI)

**Memory + context**:
- `packages/server/app/services/conversation_memory.py:53` — staleness check (P3.1)
- `packages/server/app/services/companion/context.py:65` — budget reserve order (P1.6)
- `packages/server/app/utils/token_budget.py:30` — CJK/Latin-aware estimation
- `packages/server/app/services/memory_book/checkpoint.py:1` — Redis checkpoints (P3.3)

**Middleware**:
- `packages/server/app/middleware/idempotency.py:1` — idempotency gate (P0.1, P0.6)
- `packages/server/app/middleware/daily_llm_budget.py:1` — token-aware daily cap (P3.2)

**Observability + metrics** (engineering-upgrade 2026-09-05):
- `packages/server/app/services/llm/observability.py:1` — `_log_call` sole
  structured-log exit + JSONL sink (`LLM_TRACE_JSONL_PATH`) + opt-in content
  capture (`LLM_TRACE_CAPTURE_CONTENT`, file-only, never DB)
- `packages/server/app/services/llm/metrics.py:1` — five minimal indicators
  (success rate / p95 / token cost / error classes / guardrail hits) via
  `GET /api/v1/stats/llm`; guardrail counters in `app/utils/output_filter.py`
- `ops/observability/` — metrics handbook, badcase four-factor triage
  runbook (回灌 golden set), L3 manual-review SOP
- `docs/engineering-upgrade/` — audit report + per-stage execution record

## Never rules (every one mechanically enforced — see CI gates below)

1. **Never use raw `book.title` / `book.author` in services.** Route through
   `sanitize_book_field`. Enforced: AST check `scripts/check_no_raw_book_fields.py`
   in both `ci.yml` (on `app/services/`) and `prompt-eval.yml` (Phase 3.2
   replaced the old grep, which had a `grep -v` bypass).
2. **Never put business logic in `routers/`.** Routers validate input → call
   service → return response. Enforced: `scripts/check_router_thin.py` in `ci.yml`.
3. **Never construct `TokenBudget()` without `model=` kwarg.** Silent
   wrong-window estimate on non-GLM providers. Not yet mechanically enforced
   (planned Phase 4A ruff rule) — check manually in review.
4. **Never add a `PromptTemplate` without declaring `variables=`.** Placeholder
   drift slips to runtime. Enforced: `PromptTemplate.__post_init__`
   at `app/prompts/base.py:42`.
5. **Never interpolate user-controlled text into a prompt without sanitization.**
   Use `sanitize_book_field` / `sanitize_user_input`. Manual review required
   (CI catches `book.title` / `book.author` only).
6. **Never add a new P-tag inline without an entry in `docs/incidents/`.**
   Documentation-only constraints are forbidden.
7. **Never let a test reach a real Redis** (dev `.env` has pointed at prod).
   Enforced: `tests/conftest.py` `_hermetic_redis` autouse patch of
   `redis.asyncio.from_url` (P5.1).

## Past incidents (required reading before editing these areas)

See `docs/incidents/`. Specifically, read before touching:
- **Idempotency middleware** → `docs/incidents/p0-incident-cluster.md` (P0.1, P0.6)
- **LLM fallback chain / token billing** → `docs/incidents/p0-incident-cluster.md` (P0.2)
- **SSE cancel / cross-worker** → `docs/incidents/p0-incident-cluster.md` (P0.3)
- **Circuit breaker** → `docs/incidents/p1-incident-cluster.md` (P1.2)
- **Context budgeting** → `docs/incidents/p1-incident-cluster.md` (P1.6)
- **Conversation summary** → `docs/incidents/p3-incident-cluster.md` (P3.1)
- **RAG search** → `docs/incidents/p3-incident-cluster.md` (P3.2)
- **Memory-book pipeline** → `docs/incidents/p3-incident-cluster.md` (P3.3)
- **Test fixtures / Redis mocking** → `docs/incidents/p5-test-hygiene.md` (P5.1)
- **Derived-stats caches (dashboard / book stats)** → `docs/incidents/p6-cache-staleness.md` (P6.1) — any new
  write path touching books, sessions, or annotations must call
  `invalidate_user_caches(uid)`; cache-key formats live only in
  `stats/dashboard_cache.py`.

## When prompts change

1. Bump `version=` on the `PromptTemplate` at `app/prompts/*.py`.
   i18n-hosted prompts (companion system/socratic in `app/translations/`)
   are gated by content pins in `tests/test_translation_prompt_pins.py` —
   bump the pin hash in the same PR.
2. Run mock eval locally: `cd packages/server && uv run python -m app.eval.eval_runner`.
3. Run live eval before merging prompt-content changes:
   `uv run python -m app.eval.eval_runner --live` (requires `PROMPT_EVAL_API_KEY`;
   CI's `prompt-eval-live` job runs it only when the secret is set).
4. Intentional eval-outcome change (new golden entry, deliberate behavior
   shift)? Re-record the regression baseline in the same PR:
   `uv run python -m app.eval.eval_runner --update-baseline --baseline-note "<why>"`.
   Without this, `regression_baseline.json` diffs fail CI — that gate is
   load-bearing (REGRESSION = was passing, now failing).
5. Open PR. CI runs `prompt-eval.yml` automatically.

## When adding a new LLM call site

1. Use `safe_llm_call` (text) or `safe_llm_invoke` (JSON schema). Never call
   `ChatOpenAI.ainvoke` / `.astream` directly.
2. Pass `log_label`, `user_id`, `book_id` for observability.
3. Route user-controlled text through `sanitize_book_field` / `sanitize_user_input`.
4. Build prompts via `PromptTemplate`, declare `variables=`.
5. Estimate tokens via `TokenBudget(model=<active_model>)` — never the default.

## When a live badcase appears

Follow `ops/observability/badcase-triage-runbook.md`: rebuild the chain
(chat via `chat_messages` + `ai_feedback`; non-chat via `llm_call_traces` /
JSONL sink), attribute to one of prompt/检索/工具/模型 with span evidence,
then backfill the sanitized case into `app/eval/golden_*.py` with a `guards`
annotation — the fix PR is done when that entry turns green.

## When adding a new endpoint

1. **Mutation?** Apply idempotency middleware. Auto-attach client keys.
2. **Streaming?** Use `agent_service.register_stream` / `release_stream`. Stamp
   the idempotency completion marker in the `finally` block (P0.6).
3. **Router stays thin.** Push logic to a service module.

## CI gates (what blocks merge)

| Workflow | Purpose | Trigger |
| --- | --- | --- |
| `ci.yml` | Typecheck (web + mobile) + builds + ruff + custom AST checks + backend pytest (SQLite and PostgreSQL jobs) + alembic upgrade/downgrade + web vitest | All PRs |
| `prompt-eval.yml` | Prompt rendering + sanitizer + schema + mock eval + no-raw-book-fields AST check + optional live eval | `app/prompts/**` / `app/eval/**` / sanitizer |
| `mobile.yml` | Expo mobile build + optional GitHub Release | `packages/mobile/**` PRs, `V*` tags, manual dispatch |
| `visual-regression.yml` | Screenshot diff | Weekly Mon 04:00 UTC |
| `security-review.yml` | Claude security review | All PRs (requires `ANTHROPIC_API_KEY`) |
| `secret-scan.yml` | gitleaks rule-based secret detection — no secrets required to run, any hit blocks (backstop when `security-review.yml` silently skips) | All PRs + push to `main` |
| `deploy.yml` | Build + ship to VPS; (Phase 5) browser E2E gate | Push to `main` |
| (Phase 5) `drift-scan.yml` | Mock-vs-live drift + freshness scan | Weekly Mon 04:17 UTC |

## When to run `/harness-review` (Phase 6 — event-driven)

Run the audit when ANY of these fire:

1. **Model default changes** in `app/config.py` — stress-test the harness
   assumptions encoded by the old model (Anthropic: "every harness component
   encodes an assumption about what the model can't do").
2. **New P-tag added** to `docs/incidents/` — fresh failure class may indicate
   a new systemic gap.
3. **Drift scan issue opened** by `.github/workflows/drift-scan.yml` (weekly) —
   mock-freshness, template-consistency, or live-eval drift detected.
4. **New agent / LLM service added** — onboarding a new service class (e.g.
   multi-agent pattern, background worker, scheduled job).
5. **Quarterly checkpoint** (calendar-driven as a backstop, not primary) —
   even without triggers 1–4, run the audit every quarter to catch slow drift.

After each audit, save key findings to the user's auto-memory so future
Claude Code sessions inherit the learnings. The findings + fix plan live in
`/home/ubuntu/.claude/plans/`.

## Per-PR discipline

- Every new "Never" rule in `AGENTS.md` lands in the same PR as its mechanical
  enforcement (hook / ruff rule / custom script). No documentation-only
  constraints.
- Every new `PromptTemplate` bumps `version=` and passes mock eval.
- Every new `safe_llm_call` / `safe_llm_invoke` site declares why it bypasses
  caching, if it does (default is per-user isolation).
- Every new `safe_llm_call` site that uses `cache_anon=True` documents why
  the response is user-independent (no PII, no per-user state).
- Every new incident (production bug, near-miss, regression) gets a P-tag
  inline AND a `docs/incidents/` entry in the same PR.

## Local dev quickstart

```bash
# Backend
cd packages/server && uv sync && uvicorn app.main:app --reload --port 8000

# Frontend
pnpm install && pnpm --filter @read-pal/web dev

# Lint + AST checks (mirror of ci.yml)
cd packages/server && uv run ruff check app/
cd packages/server && uv run python scripts/check_router_thin.py app/routers/
cd packages/server && uv run python scripts/check_no_raw_book_fields.py app/services/

# Tests
cd packages/server && uv run pytest      # backend
pnpm --filter @read-pal/web test         # vitest
pnpm typecheck                           # web; mobile: pnpm --filter @read-pal/mobile typecheck

# Mock eval (CI-safe)
cd packages/server && uv run python -m app.eval.eval_runner

# Live eval (requires PROMPT_EVAL_API_KEY)
cd packages/server && uv run python -m app.eval.eval_runner --live

# Drift scans (Phase 5)
cd packages/server && uv run python scripts/drift_scan.py --mode=mock-freshness
cd packages/server && uv run python scripts/drift_scan.py --mode=template-consistency
```

See `README.md` for full setup, `CONTRIBUTING.md` for style, `docs/incidents/`
for past failures.
