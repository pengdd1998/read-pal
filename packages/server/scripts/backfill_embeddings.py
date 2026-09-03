"""Backfill book_chunks embeddings via the configured embedding provider.

2026-09-02: the GLM embedding account lost its quota (account-level 429
all day), leaving 18k+ chunks with embedding=NULL and ~2.3k legacy
embedding-3 vectors that are NOT comparable with bge-m3 vectors (different
model = different vector space — cosine between them is meaningless).
This script:

  1. ``--wipe``  NULLs every existing embedding (derived data; the only
     way to get a single coherent vector space when the provider changes).
  2. Re-embeds all NULL chunks in batches via app.services.rag.embedding
     (so it uses whatever EMBEDDING_* provider is configured — local
     Ollama bge-m3 in dev).

Idempotent: re-running only processes still-NULL chunks.

Usage::

    cd packages/server && uv run python scripts/backfill_embeddings.py --wipe --yes
    cd packages/server && uv run python scripts/backfill_embeddings.py
"""
from __future__ import annotations

import asyncio
import sys
import time
from uuid import UUID

sys.path.insert(0, 'app/..')

from sqlalchemy import text  # noqa: E402

from app.db import async_session  # noqa: E402
from app.services.rag.embedding import (  # noqa: E402
    BATCH_SIZE,
    PAUSE_BETWEEN_BATCHES_S,
    get_embeddings,
)

BATCHES_PER_LOG = 25


async def wipe() -> int:
    async with async_session() as s:
        result = await s.execute(
            text('UPDATE book_chunks SET embedding = NULL WHERE embedding IS NOT NULL'))
        await s.commit()
        return result.rowcount or 0


async def count_null() -> int:
    async with async_session() as s:
        return (await s.execute(
            text('SELECT count(*) FROM book_chunks WHERE embedding IS NULL'))).scalar()


async def backfill() -> tuple[int, int]:
    """Embed NULL chunks oldest-first. Returns (embedded_ok, failed)."""
    ok = failed = 0
    last_id = UUID(int=0)
    batch_no = 0
    t0 = time.monotonic()
    while True:
        async with async_session() as s:
            rows = (await s.execute(text(
                'SELECT id, content FROM book_chunks '
                'WHERE embedding IS NULL AND id > :last ORDER BY id LIMIT :n'
            ), {'last': last_id, 'n': BATCH_SIZE})).all()
            if not rows:
                break
            vectors = await get_embeddings([r.content for r in rows])
            updates = []
            for row, vec in zip(rows, vectors):
                last_id = row.id
                if vec is None:
                    failed += 1
                    continue
                updates.append({'v': str(vec), 'i': row.id})
                ok += 1
            # executemany: ONE WAN round-trip per batch instead of one per
            # row (16 x ~200ms RTT was the bottleneck, not the model).
            if updates:
                await s.execute(text(
                    'UPDATE book_chunks SET embedding = :v WHERE id = :i'
                ), updates)
            await s.commit()
        batch_no += 1
        if batch_no % BATCHES_PER_LOG == 0:
            rate = ok / max(time.monotonic() - t0, 0.1)
            print(f'  batch {batch_no}: ok={ok} failed={failed} ({rate:.0f} chunks/s)', flush=True)
        if len(rows) < BATCH_SIZE:
            break
        await asyncio.sleep(PAUSE_BETWEEN_BATCHES_S)
    return ok, failed


async def backfill_books() -> tuple[int, int]:
    """Chunk + embed books that predate book_chunks entirely (no rows).

    Runs the standard precompute pipeline per book (chunk gen → batch
    embed → persist), so results match uploads exactly. 286 of 372
    books were uploaded before the chunking feature existed.
    """
    from app.services.rag.precompute import precompute_book_embeddings

    done = failed = 0
    while True:
        async with async_session() as s:
            rows = (await s.execute(text("""
                SELECT d.book_id, d.id, d.chapters FROM documents d
                WHERE d.chapters IS NOT NULL AND jsonb_array_length(d.chapters) > 0
                  AND NOT EXISTS (SELECT 1 FROM book_chunks bc WHERE bc.book_id = d.book_id)
                ORDER BY d.book_id LIMIT 10
            """))).all()
        if not rows:
            break
        for book_id, doc_id, chapters in rows:
            try:
                await precompute_book_embeddings(book_id, doc_id, chapters)
                done += 1
            except Exception as exc:  # noqa: BLE001 — one book must not stop the sweep
                print(f'  book {book_id} failed: {str(exc)[:120]}', flush=True)
                failed += 1
        print(f'  books processed: {done + failed} (ok={done} failed={failed})', flush=True)
    return done, failed


async def main() -> None:
    wipe_requested = '--wipe' in sys.argv
    confirmed = '--yes' in sys.argv
    books_mode = '--books' in sys.argv

    if books_mode:
        ok, failed = await backfill_books()
        print(f'DONE books: ok={ok} failed={failed}')
        return

    if wipe_requested:
        if not confirmed:
            sys.exit('--wipe deletes existing vectors (derived data). Re-run with --yes.')
        n = await wipe()
        print(f'wiped {n} existing embeddings (mixed-model space reset)')

    remaining = await count_null()
    print(f'chunks to embed: {remaining}')
    if remaining == 0:
        print('nothing to do.')
        return

    ok, failed = await backfill()
    print(f'DONE: embedded={ok} failed={failed}')


if __name__ == '__main__':
    asyncio.run(main())
