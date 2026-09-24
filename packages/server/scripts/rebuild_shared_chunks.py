"""Rebuild content-addressed book_chunks from current book_contents text.

2026-09-24 hygiene follow-up to migration 0032: shared chunks were anchored
to the FIRST uploader's book/document rows (both ON DELETE CASCADE), so
deleting that user's book silently destroyed the chunks every other copy of
the book searches through — one hash fell 1296→70 rows, nine to zero, and
four hashes still carried pre-footnote-backfill text. This script rebuilds
the hash-domain chunk set for every live hash from the CURRENT
book_contents.raw_chapters, anchored by content_hash alone (NULL
book_id/document_id, immune to user deletion cascades). Legacy NULL-hash
per-book rows are left untouched — they are the only retrieval path for
books without a content hash.

Idempotent: per hash, existing hash-domain rows are deleted before the
rebuild. Embeddings go through the configured provider (prod: local Ollama
bge-m3, ~7 chunks/s); failed batches persist as NULL-embedding rows so the
keyword path still covers them.

Usage (inside the api container, after 0032 is deployed):
    python scripts/rebuild_shared_chunks.py            # all live hashes
    python scripts/rebuild_shared_chunks.py <hash>...  # specific hashes
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import UTC, datetime

sys.path.insert(0, '.')

from sqlalchemy import delete, text  # noqa: E402

from app.db import async_session  # noqa: E402
from app.models.book_chunk import BookChunk  # noqa: E402
from app.services.rag.embedding import get_embeddings  # noqa: E402
from app.services.rag.precompute import _split_chapters  # noqa: E402

BATCH_SIZE = 16


async def rebuild_hash(session_factory, content_hash: str, chapters: list[dict]) -> int:
    from app.config import get_settings

    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    pieces = _split_chapters(chapters)
    if not pieces:
        print(f'{content_hash[:8]}: no chunkable content — skipped', flush=True)
        return 0

    cap = get_settings().max_embedding_calls
    to_embed = pieces[:cap]
    if len(pieces) > cap:
        print(f'{content_hash[:8]}: embedding cap {cap} of {len(pieces)} chunks', flush=True)

    embeddings: list[list[float] | None] = []
    for start in range(0, len(to_embed), BATCH_SIZE):
        batch = [p[2] for p in to_embed[start:start + BATCH_SIZE]]
        result = await get_embeddings(batch)
        embeddings.extend(result)
    while len(embeddings) < len(to_embed):
        embeddings.append(None)

    async with session_factory() as session:
        await session.execute(
            delete(BookChunk).where(BookChunk.content_hash == content_hash),
        )
        # Content-addressed rows: hash is the only anchor (0032 made the
        # book/document columns nullable for exactly these rows).
        values = [
            {
                'id': uuid.uuid4(),
                'book_id': None,
                'document_id': None,
                'content_hash': content_hash,
                'chapter_index': ch,
                'chunk_index': ck,
                'content': body,
                'embedding': emb,
                'created_at': datetime.now(UTC),
            }
            for (ch, ck, body), emb in zip(to_embed, embeddings, strict=False)
        ]
        dialect = 'postgresql'
        stmt = None
        try:
            bind = session.get_bind()
            dialect = bind.dialect.name if bind else 'postgresql'
        except Exception:  # noqa: BLE001 — dialect probe is best-effort
            pass
        insert_cls = pg_insert if dialect == 'postgresql' else sqlite_insert
        stmt = insert_cls(BookChunk).values(values)
        await session.execute(stmt)
        await session.commit()
    embedded = sum(1 for e in embeddings if e is not None)
    print(f'{content_hash[:8]}: {len(values)} chunks ({embedded} embedded)', flush=True)
    return len(values)


async def main() -> None:
    wanted = [a for a in sys.argv[1:] if not a.startswith('-')]
    async with async_session() as session:
        rows = (await session.execute(text("""
            SELECT DISTINCT b.content_hash
            FROM books b
            WHERE b.content_hash IS NOT NULL
        """))).scalars().all()
        hashes = [h for h in rows if not wanted or h in wanted]
        # Current text per hash (raw_chapters carries the post-backfill
        # content; the slim chapters column lacks rawContent but has
        # title/content which is all chunking needs).
        contents = {
            h: (await session.execute(text(
                "SELECT chapters FROM book_contents WHERE content_hash = :h"),
                {'h': h})).scalar()
            for h in hashes
        }

    total = 0
    for h in hashes:
        chapters = contents.get(h) or []
        if not chapters:
            print(f'{h[:8]}: no book_contents row — skipped', flush=True)
            continue
        total += await rebuild_hash(async_session, h, chapters)
    print(f'DONE: {total} chunks across {len(hashes)} hashes')


if __name__ == '__main__':
    asyncio.run(main())
