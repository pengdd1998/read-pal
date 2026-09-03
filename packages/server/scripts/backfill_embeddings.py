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
            for row, vec in zip(rows, vectors):
                last_id = row.id
                if vec is None:
                    failed += 1
                    continue
                await s.execute(text(
                    'UPDATE book_chunks SET embedding = :v WHERE id = :i'
                ), {'v': str(vec), 'i': row.id})
                ok += 1
            await s.commit()
        batch_no += 1
        if batch_no % BATCHES_PER_LOG == 0:
            rate = ok / max(time.monotonic() - t0, 0.1)
            print(f'  batch {batch_no}: ok={ok} failed={failed} ({rate:.0f} chunks/s)', flush=True)
        if len(rows) < BATCH_SIZE:
            break
        await asyncio.sleep(PAUSE_BETWEEN_BATCHES_S)
    return ok, failed


async def main() -> None:
    wipe_requested = '--wipe' in sys.argv
    confirmed = '--yes' in sys.argv

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
