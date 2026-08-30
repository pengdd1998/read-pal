# P5 — Test hygiene cluster

## P5.1 — Local test runs were reading and writing the production Redis

**Found:** 2026-08-30, while verifying the agent/streaming decomposition.
**Severity:** P1 (production data pollution; masked test failures).

**Locations**
- `packages/server/tests/conftest.py:163` — `_hermetic_redis` autouse patch (the fix)
- `packages/server/tests/conftest.py:194` — `_reset_inprocess_state` autouse reset
- `packages/server/tests/test_auth_service_unit.py` — the canary that caught it

**What went wrong**

The developer `.env` points `REDIS_URL` at the live server
(`redis://…:35552`). Only the `client` fixture patched
`redis.asyncio.from_url` — service-level tests (which call `get_redis()`
directly) built a **real** client against that URL. Consequences:

1. **Production pollution**: `test_auth_service_unit` redeems a refresh
   token with a fixed jti (`unique-jti-123`) and a 2286-year exp. The
   first-ever local run SET-NX'd `auth:refresh-used:unique-jti-123` into
   **production** with a ~260-year TTL. Every later run saw the ledger
   entry, classified itself as a replay, and failed — a deterministic
   failure masked only by test ordering (other files pre-created the
   singleton in different states).
2. **Cross-test contamination in-process**: the singleton's connection
   pool bound to one test's event loop; later tests on fresh loops got
   `RuntimeError: Event loop is closed` / `attached to a different loop`.
   Real rate-limit counters were shared across files (register limiter
   exhausted → `RATE_LIMIT_EXCEEDED` in unrelated files).

CI never saw this: no Redis reachable → in-memory fallbacks → hermetic by
accident.

**Why the fix works**

- `_hermetic_redis` (autouse) patches the **constructor**
  (`redis.asyncio.from_url`), so no test can build a real client in any
  code path — hermeticity by construction, not per-test discipline.
  Redis-outage fallbacks remain testable by patching `get_redis` /
  `_get_redis` to raise (existing fail-open/fail-closed tests do this).
- `_reset_inprocess_state` (autouse) clears lazy singletons and in-memory
  fallbacks per test (`redis._client`, `_pubsub_client`,
  `rate_limiter._memory_store`, `_auth_ledger._in_memory_blacklist`,
  `_redis_ever_connected`, `rag._constants._http_client`) so ordering
  can't reintroduce coupling.

**Regression red-flags**
- A test that needs real Redis semantics "just this once" — that's how
  this started. Patch instead.
- New module-level lazy singletons (clients, caches, registries) without
  a corresponding reset in `_reset_inprocess_state`.
- Unexplained order-dependent failures in file subsets that pass in the
  full suite (or vice versa) — historically the smoke of this class.

**Manual follow-up (operator)**
- `DEL auth:refresh-used:unique-jti-123` (and any other fixed-jti
  `auth:refresh-used:*` keys from `test_auth_service_unit.py`) on the
  production Redis — they won't expire until ~2286.
