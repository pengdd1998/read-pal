# P6 — Derived-cache staleness cluster

## P6.1 — Deleting a book kept it on the dashboard as "current reading" for a full cache TTL

**Found:** 2026-08-31, user report: after deleting The Great Gatsby from the
library, the dashboard kept rendering it as the current book with its reading
stats. Reproduced via API: `DELETE /books/{id}` → 204, then
`GET /stats/dashboard` still listed the book, while `GET /books` (truth) was
already empty.

**Severity:** P1 (user-visible inconsistency at the product's front door;
self-healed only after the 5-minute cache TTL).

**Locations**
- `packages/server/app/services/stats/dashboard_cache.py` — `invalidate_user_caches` (the fix) + `book_stats_cache_key` (single source for the `stats:books:{uid}` key)
- `packages/server/app/services/book_service.py` — `create_book` / `update_book` / `delete_book` / `get_book_stats`
- `packages/server/app/services/reading_session_service.py` — `end_session`
- `packages/server/app/services/annotation_service.py` — `create_annotation` / `update_annotation` / `delete_annotation`
- `packages/server/tests/test_dashboard_cache_invalidation.py` — regression tests

**What went wrong**

`GET /api/v1/stats/dashboard` caches its entire payload per user in Redis
(`stats:dashboard:{uid}`, TTL = `cache_data_ttl`, 5m default), and
`get_book_stats` caches the library-status aggregate the same way
(`stats:books:{uid}`). The invalidation helper `invalidate_dashboard_cache`
existed — with a docstring saying exactly when to call it — but had **zero
callers**: book CRUD, session end, and annotation writes all skipped it.
`delete_book` invalidated only the immutable chapter-content cache, not the
derived aggregates, so the dashboard served a deleted book as "current
reading" until the TTL expired. The frontend was innocent: it refetches on
mount and window focus; the server kept handing back the stale payload.

**Why the fix works**

Write-path invalidation with a single entry point: every service write that
can change a derived aggregate calls `invalidate_user_caches(uid)`, which
drops both keys. DB-level semantics needed no change — `annotations.book_id`
and `reading_sessions.book_id` are already `ondelete='CASCADE'`, so deletion
is immediately consistent everywhere once the caches are dropped. The
`stats:books:{uid}` key format moved into `book_stats_cache_key` so the read
path and the invalidation path cannot drift.

**Regression red-flags**

- Adding a NEW derived-stats cache key without adding it to
  `invalidate_user_caches` — the next "deleted but still visible" bug.
- Adding a NEW mutating write path (service function that changes books,
  sessions, or annotations) without calling `invalidate_user_caches`.
- Do not reintroduce key-format literals (`f'stats:books:{...}'`) outside
  `dashboard_cache.py`.
- Tests: `tests/test_dashboard_cache_invalidation.py` pins the `delete`
  calls per mutation; extend it when a new write path lands.
