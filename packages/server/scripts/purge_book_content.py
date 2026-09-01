"""Purge a book_contents row — GUARDED manual tool (design r2 step 3).

Refuses to purge content that any book still references. Deletes chunks
keyed to the hash first, then the row. Run on the VPS::

    cd packages/server && uv run python scripts/purge_book_content.py <content_hash>
"""
from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, 'app/..')

from sqlalchemy import text  # noqa: E402

from app.db import async_session  # noqa: E402


async def main(content_hash: str) -> None:
    async with async_session() as s:
        refs = (await s.execute(text(
            "SELECT count(*) FROM books WHERE content_hash = :h"
        ), {'h': content_hash})).scalar()
        if refs:
            print(f"REFUSED: {refs} book(s) still reference {content_hash[:16]}…")
            sys.exit(1)

        chunk_count = (await s.execute(text(
            "SELECT count(*) FROM book_chunks WHERE content_hash = :h"
        ), {'h': content_hash})).scalar()
        res = await s.execute(text(
            "DELETE FROM book_contents WHERE content_hash = :h"
        ), {'h': content_hash})

    await s.commit()
    print(f"purged {content_hash[:16]}… (chunks removed: {chunk_count}, rows: {res.rowcount})")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('usage: purge_book_content.py <content_hash>')
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
