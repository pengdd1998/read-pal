# Incident Archive — read-pal

This directory aggregates past production incidents and engineering refactor notes
that are otherwise scattered as inline `# P0.x` / `P1.x` / `P3.x` / `P4.x` comments
throughout `packages/server/app/`. Each entry ties a tag to its file:line citations,
explains what went wrong, why the current fix works, and what to watch for in
PRs that touch the area.

## Why this exists

Hashimoto's discipline: **every line of `AGENTS.md` corresponds to a past failure.**
Without aggregation, the same incident class repeats months later when the next
contributor (human or AI) touches the code without reading every inline P-tag.
This archive is the bridge between scattered inline comments and the
high-level navigation map at `/home/ubuntu/projects/read-pal/AGENTS.md`.

## Index

### Production-critical (`p0-incident-cluster.md`)
- **P0.1** — Idempotency enforcement + mood-field prompt-injection closure
- **P0.2** — Token-billing pre-charge held across the fallback chain
- **P0.3** — Cross-worker stream cancellation + heartbeat crash detection
- **P0.6** — Idempotency completion marker (`ALREADY_COMPLETED` vs `RATE_LIMIT_EXCEEDED`)

### Reliability (`p1-incident-cluster.md`)
- **P1.1** — `Retry-After` header honored on 429s
- **P1.2** — Circuit-breaker `HALF_OPEN` probe single-flight + termination guard
- **P1.4** — SSE stalled-stream warning before hard timeout
- **P1.5** — JSON repair ladder applied to cached entries
- **P1.6** — Budget reserve order: must-include content before system prompt

### Performance / caching (`p3-incident-cluster.md`)
- **P3.1** — Conversation-summary prompt_version + schema_version staleness check
- **P3.2** — Hybrid search via RRF + token-aware daily budget path
- **P3.3** — Redis-backed memory-book checkpoints + DB-as-truth
- **P3.4** — Per-section context budgeting with base prompt pinned

### Refactor log (`p4-refactor-log.md`)
- **P4.1** — Trace-writer flush on shutdown + regression baseline persistence
- **P4.2** — Observability: error classification + cache-hit trace rows
- **P4.4** — DRY extractions (7 occurrences — historical reference)

## How to use

1. **Before editing** any file cited under a P-tag, read the corresponding
   incident write-up. The "regression red-flag" section tells you what to
   watch for in your PR.
2. **When adding a new P-tag** to inline code, also add an entry to the
   appropriate cluster file in the same PR. Documentation-only constraints
   are forbidden — every entry must cite working code.
3. **Re-run `/harness-review`** when a new P-tag is added (per
   `AGENTS.md#when-to-run-harness-review`).

### Test hygiene (`p5-test-hygiene.md`)
- **P5.1** — Local tests were reading/writing the production Redis (fixed by constructor-level autouse patch)

### Derived-cache staleness (`p6-cache-staleness.md`)
- **P6.1** — Book deletion served the deleted book as "current reading" for a full dashboard-cache TTL (fixed by write-path `invalidate_user_caches`)
