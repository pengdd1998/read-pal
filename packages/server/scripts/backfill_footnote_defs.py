"""One-off backfill: populate ``books.metadata.footnote_definitions`` for
legacy books uploaded before footnote extraction shipped (M4 存量回填).

New uploads get the definition map at parse time (zipfile_path). Legacy
books only have their per-chapter ``rawContent`` in ``documents.content``
JSON, which still contains the definition elements — so we re-run
``extract_footnote_definitions`` over the stored chapters and merge the
result into the book's metadata in place.

Dry-run by default; pass ``--apply`` to write. Idempotent: books that
already carry ``footnote_definitions`` in metadata are skipped, and books
with no extractable definitions are left untouched.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging

from sqlalchemy import select

from app.db import async_session
from app.models import Book, Document
from app.services.epub_parser.footnote_defs import extract_footnote_definitions
from app.services.stats.dashboard_cache import invalidate_user_caches

logger = logging.getLogger('read-pal.backfill_footnote_defs')


def _iter_chapter_html(chapters_json) -> list[tuple[str, str]]:
    """Yield ``(chapter_title_or_index, raw_html)`` pairs from a document."""
    if isinstance(chapters_json, str):
        try:
            chapters_json = json.loads(chapters_json)
        except (TypeError, ValueError):
            return []
    if isinstance(chapters_json, dict):
        chapters_json = chapters_json.get('chapters')
    if not isinstance(chapters_json, list):
        return []
    pairs = []
    for i, ch in enumerate(chapters_json):
        if isinstance(ch, dict) and ch.get('rawContent'):
            pairs.append((str(ch.get('title') or i), ch['rawContent']))
    return pairs


async def backfill(apply: bool) -> None:
    async with async_session() as session:
        books = (await session.execute(select(Book))).scalars().all()
        docs_by_book: dict = {}
        if books:
            docs = (await session.execute(select(Document))).scalars().all()
            for d in docs:
                docs_by_book.setdefault(d.book_id, []).append(d)

        candidates = 0
        updated = 0
        touched_users: set = set()
        for book in books:
            meta = book.metadata_ if isinstance(book.metadata_, dict) else {}
            if meta.get('footnote_definitions'):
                continue
            defs: dict[str, str] = {}
            for doc in docs_by_book.get(book.id, []):
                for _label, html in _iter_chapter_html(doc.chapters):
                    defs.update(extract_footnote_definitions(html, str(book.id)))
                    if len(defs) >= 500:
                        break
            if not defs:
                continue
            candidates += 1
            names = ', '.join(sorted(defs)[:5])
            logger.info('book=%s title=%.30s defs=%d (%s...)',
                        book.id, (book.title or '')[:30], len(defs), names)
            if apply:
                book.metadata_ = {**meta, 'footnote_definitions': defs}
                touched_users.add(book.user_id)
                updated += 1

        if apply and updated:
            await session.commit()
            for uid in touched_users:
                await invalidate_user_caches(uid)
        print(f'scan complete: books_missing={sum(1 for b in books if not (isinstance(b.metadata_, dict) and b.metadata_.get("footnote_definitions")))} '
              f'backfillable={candidates} updated={updated if apply else 0} apply={apply}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='write changes (default: dry run)')
    parser.add_argument('-v', '--verbose', action='store_true')
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO)
    asyncio.run(backfill(apply=args.apply))


if __name__ == '__main__':
    main()
