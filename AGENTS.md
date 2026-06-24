# AGENTS.md — read-pal navigation map

> Source-of-truth navigation for AI assistants (Claude Code, Cursor, Copilot)
> and human contributors. Map, not super-prompt — progressive disclosure.
> Keep under 150 lines. Update inline P-tag references via
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
- `packages/server/app/services/agent_service.py:43` — heartbeat constants
- `packages/server/app/services/agent_service.py:188` — `register_stream`
- `packages/server/app/services/companion/streaming.py:64` — chunk loop + cancel

**Prompts + eval**:
- `packages/server/app/prompts/base.py:27` — `PromptTemplate` dataclass
- `packages/server/app/eval/eval_runner.py:1` — golden dataset runner
- `packages/server/app/eval/regression_baseline.py:1` — PASS/FAIL/REGRESSION diff

**Memory + context**:
- `packages/server/app/services/conversation_memory.py:53` — staleness check (P3.1)
- `packages/server/app/services/companion/context.py:65` — budget reserve order (P1.6)
- `packages/server/app/utils/token_budget.py:30` — CJK/Latin-aware estimation
- `packages/server/app/services/memory_book/checkpoint.py:1` — Redis checkpoints (P3.3)

**Middleware**:
- `packages/server/app/middleware/idempotency.py:1` — idempotency gate (P0.1, P0.6)
- `packages/server/app/middleware/daily_llm_budget.py:1` — token-aware daily cap (P3.2)

## Never rules (every one mechanically enforced — see CI gates below)

1. **Never use raw `book.title` / `book.author` in services.** Route through
   `sanitize_book_field`. Enforced: `.github/workflows/prompt-eval.yml` (Phase 3
   will replace the grep with an AST check at `scripts/check_no_raw_book_fields.py`).
2. **Never put business logic in `routers/`.** Routers validate input → call
   service → return response. Enforced: `scripts/check_router_thin.py` (Phase 3).
3. **Never construct `TokenBudget()` without `model=` kwarg.** Silent
   wrong-window estimate on non-GLM providers. Enforced: ruff rule (Phase 4A).
4. **Never add a `PromptTemplate` without declaring `variables=`.** Placeholder
   drift slips to runtime. Enforced: `PromptTemplate.__post_init__`
   at `app/prompts/base.py:42`.
5. **Never interpolate user-controlled text into a prompt without sanitization.**
   Use `sanitize_book_field` / `sanitize_user_input`. Manual review required
   (CI catches `book.title` / `book.author` only).
6. **Never add a new P-tag inline without an entry in `docs/incidents/`.**
   Documentation-only constraints are forbidden.

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

## When prompts change

1. Bump `version=` on the `PromptTemplate` at `app/prompts/*.py`.
2. Run mock eval locally: `cd packages/server && uv run python -m app.eval.eval_runner`.
3. (Phase 2) Run live eval before merging prompt-content changes:
   `uv run python -m app.eval.eval_runner --live` (requires `PROMPT_EVAL_API_KEY`).
4. Open PR. CI runs `prompt-eval.yml` automatically.

## When adding a new LLM call site

1. Use `safe_llm_call` (text) or `safe_llm_invoke` (JSON schema). Never call
   `ChatOpenAI.ainvoke` / `.astream` directly.
2. Pass `log_label`, `user_id`, `book_id` for observability.
3. Route user-controlled text through `sanitize_book_field` / `sanitize_user_input`.
4. Build prompts via `PromptTemplate`, declare `variables=`.
5. Estimate tokens via `TokenBudget(model=<active_model>)` — never the default.

## When adding a new endpoint

1. **Mutation?** Apply idempotency middleware. Auto-attach client keys.
2. **Streaming?** Use `agent_service.register_stream` / `release_stream`. Stamp
   the idempotency completion marker in the `finally` block (P0.6).
3. **Router stays thin.** Push logic to a service module.

## CI gates (what blocks merge)

| Workflow | Purpose | Trigger |
| --- | --- | --- |
| `ci.yml` | Typecheck + build + backend pytest + (Phase 3) ruff AST checks | All PRs |
| `prompt-eval.yml` | Prompt rendering + sanitizer + schema + mock eval + `book.title` grep; (Phase 2) live eval | `app/prompts/**` / `app/eval/**` / sanitizer |
| `security-review.yml` | Claude security review | All PRs (requires `ANTHROPIC_API_KEY`) |
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
