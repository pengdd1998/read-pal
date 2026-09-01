"""book_contents usage report (design r2 step 3 — monitoring entry point).

Run on the VPS (or via the content-usage-report workflow) to see storage
usage and orphaned shared content. Read-only; no deletion here — manual
purge goes through purge_book_content.py.

Usage::

    uv run python scripts/report_book_contents.py          # table summary
    uv run python scripts/report_book_contents.py --json   # machine-readable
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys

sys.path.insert(0, 'app/..')

from sqlalchemy import text  # noqa: E402

from app.db import async_session  # noqa: E402

ORPHAN_WARNING_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB threshold


async def main(json_output: bool) -> None:
    from app.db import async_session

    async with async_session() as s:
        totals = (await s.execute(text("""
            SELECT count(*) AS rows,
                   COALESCE(sum(octet_length(chapters::text) + octet_length(COALESCE(raw_chapters::text, ''))), 0) AS bytes
            FROM book_contents
        """))).first()

        orphans = (await s.execute(text("""
            SELECT bc.content_hash, bc.title, bc.file_type, bc.created_at,
                   octet_length(COALESCE(bc.chapters::text, '')) AS bytes
            FROM book_contents bc
            WHERE NOT EXISTS (SELECT 1 FROM books b WHERE b.content_hash = bc.content_hash)
            ORDER BY bytes DESC
        """))).all()

        by_type = (await s.execute(text("""
            SELECT file_type, count(*),
                   sum(octet_length(COALESCE(chapters::text, ''))) AS bytes
            FROM book_contents GROUP BY file_type
        """))).all()

    total_rows = totals.rows or 0
    total_bytes = int(totals.bytes or 0)
    orphan_bytes = sum(int(r.bytes or 0) for r in orphans)

    if json_output:
        print(json.dumps({
            'total_rows': total_rows,
            'total_bytes': total_bytes,
            'orphan_rows': len(orphans),
            'orphan_bytes': orphan_bytes,
            'warning': orphan_bytes > ORPHAN_WARNING_BYTES,
            'orphans': [
                {'hash': r.content_hash, 'title': r.title, 'bytes': int(r.bytes or 0)}
                for r in orphans
            ],
        }, ensure_ascii=False, indent=2, default=str))
        return

    print(f"book_contents: {total_rows} rows, {total_bytes / 1024 / 1024:.1f} MB")
    print(f"orphans (no shelf reference): {len(orphans)} rows, {orphan_bytes / 1024 / 1024:.1f} MB")
    if orphan_bytes > ORPHAN_WARNING_BYTES:
        print(f"⚠ orphan storage exceeds {ORPHAN_WARNING_BYTES / 1024 ** 3:.0f} GB — consider purge")
    if orphans:
        print('orphan detail:')
        for r in orphans:
            print(f"  {r.content_hash[:16]}… {r.title[:36]:38} {int(r.bytes or 0) // 1024:6} KB")


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--json', action='store_true')
    args = p.parse_args()
    asyncio.run(main(args.json))
