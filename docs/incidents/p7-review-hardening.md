# P7 — 24h-review hardening cluster (backfilled 2026-09-18)

> Backfill note: these three fixes shipped 09-16/09-17 without the P-tag +
> incident-entry discipline AGENTS.md requires (violation of Per-PR
> discipline, itself logged in the 09-17 PM gap report as P0-5). Entries
> reconstructed from the fix commits' own root-cause write-ups.

## P7.1 — Tool timeout poisoned the shared DB session and dropped the turn's user message

**Found:** 2026-09-16, second 24h code review (session cdbcdba6), via WT
suite failure — a cache-hit turn after a tool timeout lost the turn's user
message. Fix: `ad5c8d62`.

**Severity:** P1 (production-grade data-loss class: silent message drop on a
legal timeout path; rate = any planner/tool deadline hit followed by a
cache-hit turn).

**Locations**
- `packages/server/app/services/companion/tools/registry.py` — `_heal_shared_session` (the fix; called on timeout/exception paths)
- `packages/server/tests/test_companion_tools.py` — regression tests

**What went wrong**

`asyncio.wait_for` cancellation can land mid-DB-operation, leaving the shared
request session with an invalidated transaction. The same-plan next tool and
the main path's `release_db` already self-healed, but the **cache-hit path
ran `save_message` BEFORE `release_db`** — a poisoned session made that
write a no-op, silently dropping the user's message for the turn.

**Why the fix works**

`_heal_shared_session(db)` rolls the session back to a clean state on every
tool timeout/exception exit, so any subsequent write on the shared session
(the cache-hit `save_message` included) lands on a usable transaction; after
a tool DB failure `db.in_transaction()` is False and the session is
immediately reusable.

## P7.2 — 24h-review ops/security quad: ops key in URL, CSP `http:`, stale parser global, unbounded map

**Found:** 2026-09-16/17 code reviews. Fixes: `eb582e83` (stale global, ops
key, unbounded map) + `4907e78a` (app-level CSP `img-src http:`), verified in
prod via `curl -I` on 09-17 (`e3570f3c` close-out).

**Severity:** P2 individually (secret in access logs; mixed-content
weakening; pathological-EPUB memory growth; one-shot parser bug), P1 as a
cluster at the VPS edge.

**Locations**
- `packages/server/app/routers/llm_metrics.py` — ops key moved from URL query to `X-Ops-Key` header (P7.2)
- `packages/server/app/main.py` — CORS `allow_headers` entry for `X-Ops-Key`; app-level CSP dropped `http:` from `img-src` (P7.2)
- `packages/server/app/services/parsers/epub/footnote_defs.py` — `MAX_FOOTNOTE_DEFS = 500` total-size valve (P7.2; module migrated from `services/epub_parser/` in M2.2)
- `packages/server/app/services/parsers/epub/zipfile_path.py` — stale-global fix now lives here (ebooklib path retired in M2.2) (P7.2)

**What went wrong / why the fixes work**

The `/ops/llm` metrics view authenticated with `?key=…` in the URL — the
secret landed in every access log between client and app; the header move
removes it from all logs (CORS entry added because cross-origin clients
preflight custom headers). The app-level CSP allowed `http:` images,
weakening the edge CSP that had already dropped it. The EPUB parser kept a
module-level global that went stale across parses within one process. The
footnote-definitions map had per-entry caps but no total bound, so a
pathological EPUB could balloon `Book.metadata_` and every book-detail
response; the 500-entry valve bounds it to ~1 MB.

## P7.3 — Footnote click listener bound before the content div existed

**Found:** 2026-09-16, FN suite (FN1/FN2 misses — footnotes unclickable on a
cold load). Fix: `2ffcf718`.

**Severity:** P2 (feature dead-on-arrival on first chapter load; worked
after any chapter switch).

**Locations**
- `packages/web/src/components/reading/core/ReaderViewParts.tsx` — click-interceptor effect now keyed on `[bookId, sanitizedContent]` with the re-bind rationale in a trailing comment (P7.3)

**What went wrong / why the fix works**

The footnote click interceptor attached once on mount, but `.reader-content`
renders conditionally — on a cold load the div did not exist at effect run,
so the listener bound to nothing and footnotes were inert until a chapter
change re-rendered it. Keying the effect on the sanitized content re-binds
the listener exactly when the content div (re)mounts.

## P7.4 — RAG spoiler limit read the page-segment index, leaking unread chapters

**Found:** 2026-09-01 as BUG-20260901-007 (BND-S05: companion confirmed a
character death in unread chapter 4); root cause located 2026-09-18 during
batch-1.5 execution — the S2 had been attributed to prompt weakness alone.

**Severity:** S2 (privacy-of-plot breach: the product's core anti-spoiler
promise, broken end-to-end for the exact question class it exists for).

**Locations**
- `packages/server/app/services/rag/context.py` — `_fetch_book_and_spoiler_limit` (the fix: `current_page`, not `current_segment`)
- `packages/server/app/services/rag/cross_book.py` — `_spoiler_limit` (same fix)
- `packages/server/app/translations/{zh,en}.json` — `spoiler_block_active` hardened: confirmation questions (yes/no, probability, indirect) about unread outcomes are banned outright
- `packages/server/tests/regressions/test_p74_spoiler_limit_chapter_field.py` — 6 regression tests
- `app/eval/golden_companion.py` — `COMPANION_CHAT_SPOILER` golden entry (guards: spoiler)

**What went wrong**

`current_page` is the chapter index; `current_segment` is the page-segment
index WITHIN the chapter that resets to 0 on every chapter change. The
spoiler limit read `current_segment` with a comment claiming it was
"chapter-level progress". Two failure modes: chapter 1 @ segment 4 →
`max_chapter_index=4` → RAG served chapters 2-4 and the companion
confirmed the unread death (the BND-S05 leak); chapter 5 @ segment 0 →
`max_chapter_index=0` → RAG starved to chapter 0 (silent answer-quality
loss nobody had diagnosed).

**Why the fix works**

The chapter cap now derives from `current_page` (the chapter index the
client PATCHes and the reader restores — verified against the client
pipeline), so unread chapters never enter the retrieved context regardless
of prompt obedience. The prompt block hardening (no confirm/deny on
outcome questions) covers the residual vector of the model inferring from
already-read text; the golden entry + unit tests pin both contracts.

## How to avoid (cluster-level)

1. Review-driven fixes are still production fixes: same PR discipline
   (P-tag inline + incident entry) applies — the backfill itself was
   necessary because this was skipped.
2. Timeout paths must be audited for what they leave behind (sessions,
   locks, half-written state), not just what they return.
3. Secrets never ride in URLs; every new custom header needs the CORS
   `allow_headers` entry in the same PR.
4. Per-entry caps without total bounds are half a valve — size both.
5. Event-listener effects must re-bind on the mount of their target, not of
   the component (conditional DOM = deps must include the content that
   spawns it).

## P7.5 — get_db teardown-race handler was unreachable (dead except ordering)

**Symptom**

Cancelling the research SSE stream (`POST /api/v1/agents/research/stream`,
2026-09-20 J2 verification) logged an unhandled 500 after the client was
already gone:

    sqlalchemy.dialects.postgresql.asyncpg.InterfaceError:
    cannot call Transaction.commit(): the underlying connection is closed
    File "app/db.py", line 115, in get_db

**Root cause**

`get_db` had the dedicated teardown-race handler written as
`except DBAPIError: rollback; raise` FOLLOWED by
`except InterfaceError: log; rollback` — but sqlalchemy's
`InterfaceError` SUBCLASSES `DBAPIError`, so the race always fell into
the first branch and was re-raised. The specific handler was dead code
from the day it was written (companion streams masked it: their persist
re-checks-out a connection before teardown, so the teardown commit had a
live connection).

The trigger sequence (new with the research stream): generator calls
`release_db()` (returns connection to pool) → client disconnects →
dependency teardown commits on the returned connection → InterfaceError
→ re-raised → unhandled 500 in logs.

**Fix**

`app/db.py` `get_db`: `except InterfaceError` now precedes
`except DBAPIError`. Pinned by `tests/services/test_db_teardown_race.py`
(an InterfaceError from the teardown commit must not escape `get_db`;
other DBAPIErrors must still re-raise).

**How to avoid**

Python except clauses are ordered most-specific-first — when two handlers
are in a subclass relation, the narrow one goes on top. A handler that
has never fired in tests is a handler that does not exist.

## P7.6 — pypdf exceptions bypassed the upload 422 ladder (corrupt/encrypted → 500)

**Symptom**

Uploading a corrupt or password-encrypted PDF returned an unhandled 500
(risk review 2026-09-20, /tmp fixture reproduction; reachable at e6e12a98).

**Root cause**

pypdf's exception hierarchy (`PdfReadError` ⊂ `PyPdfError` ⊂ `Exception`)
shares no base with the upload router's
`except (ValueError, OSError, KeyError, RuntimeError)` → 422 ladder.
`PdfStreamError` (corrupt) fires at `PdfReader()` construction;
`FileNotDecryptedError` (encrypted) at `.pages` access. Both sailed past
every handler.

**Fix**

`app/services/parsers/pdf.py` `process_pdf` converts every pypdf raise
into a typed `PdfParseError`: `pdf_corrupt_or_unsupported` (constructor /
pages / extract_text), `pdf_encrypted` (real password or AES without the
cryptography dependency). Empty-password decrypt still succeeds for
owner-locked (restrictions-only) PDFs so they keep uploading. zh/en
copy added; HTTP-verified 422 ×2; 12 parser tests including the
owner-locked regression guard.

**How to avoid**

Third-party exception hierarchies don't join your ValueError ladder by
luck — every new parser/SDK gets its raises converted at the module
boundary into typed errors the router already knows.

## P7.7 — Bulk embedding backfill silently zeroed HNSW semantic search

**Symptom**

After backfilling 1251 chunk embeddings (2026-09-20, dev), every
semantic search returned zero rows: the Research agent answered
"no sources" for queries that had returned results hours earlier. No
errors logged — the app's DBAPIError catch saw nothing because nothing
raised.

**Root cause**

The mass ``UPDATE book_chunks SET embedding = ...`` left the HNSW
cosine index (``ix_book_chunks_embedding_cosine``) in a state where its
index scans return zero rows. Postgres plans
``ORDER BY embedding <=> q LIMIT k`` as an HNSW index scan (that's the
point of the index) while filtered COUNTs use seq scans — so
verification queries that counted rows looked healthy and the actual
top-k searches were empty. Detection signature: **count with the same
predicate > 0 while ORDER BY-distance LIMIT returns 0**.

Fix was ``REINDEX INDEX ix_book_chunks_embedding_cosine`` (7.9s on 30k
chunks). ``scripts/backfill_embeddings.py`` now prints the required
REINDEX as its final step (the script cannot run DDL itself: identifiers
cannot be parameterized and the commit gate blocks constant DDL
strings — the docstring carries the runbook).

**Stacked diagnosis note**

This surfaced while diagnosing Research findings=0 and was the third
layer under two others fixed the same day: unread books contributing
chapter-0 front-matter noise (excluded from the research fan-out now,
``rag/cross_book.py``) and the library-wide status count hiding the
no-progress state behind the auto-seeded sample book (three-state scope
classification: empty / unread_only / eligible). Also
``MAX_EMBEDDING_CALLS=300`` (.env) had been capping fresh uploads at 300
embedded chunks per book — raised to 2000 for the local Ollama backend
where embedding is free.

**How to avoid**

After ANY bulk write to an indexed vector column, verify with an
ORDER BY-distance LIMIT query (not a count) and REINDEX on doubt.
Retrieval regressions need layer-by-layer evidence: scope → eligibility
→ per-book retrieval → index health.
