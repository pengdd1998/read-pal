"""Backfill chapter-scoped footnotes onto already-parsed books.

The 2026-09-23 footnote badcase (路边野餐): per-chapter note ids collide
in the flat metadata map (dict.update across spine files — the last
notes-bearing chapter wins), the chapter-end notecontent blocks leak into
the reading flow, and markers keep raw hrefs the reader cannot resolve
when the definition sits in a different render segment. The parser now
rewrites markers to scoped keys (rpfnd-ch{i}-{frag}), strips the
definition blocks, and stores a scoped map — but uploads are parsed once
and content-addressed rows are immutable (ON CONFLICT DO NOTHING), so
books parsed before the fix keep the broken shape forever.

This script re-processes STORED chapters in place: per chapter it strips
notecontent blocks, rewrites marker hrefs via the same parser functions,
rebuilds the scoped definition map, updates the shared book_contents row,
refreshes books.metadata for every book sharing the hash, and drops the
Redis chapter cache so the next read picks the fixed payload. Books
without a content_hash read from their legacy Document row, which this
script intentionally leaves untouched (pre-0026 books predate footnote
extraction entirely — no map, no rewrite, unchanged behavior).

Chapter file names (needed to pair cross-file markers with their
definition chapter) are recovered from the notecontent backlink hrefs —
e.g. ``<a href="part0003.html#noteBack_1">`` names part0003.html. Same-
file families (the LuBianYeCan shape) resolve exactly; chapters without
recoverable names fall back to a synthetic ``ch{i}.html`` that still
resolves their own same-file markers.

Idempotent: chapters without notecontent blocks are skipped; re-running
on a fixed row is a no-op (nothing left to strip).

Usage (inside the api container, after the fix is deployed):
    docker compose run --rm api python scripts/backfill_scoped_footnotes.py
"""
from __future__ import annotations

import asyncio
import re
import sys
from collections import Counter

sys.path.insert(0, '.')

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import async_session  # noqa: E402
from app.models.book import Book  # noqa: E402
from app.models.book_content import BookContent  # noqa: E402
from app.services.parsers.epub.boilerplate import coalesce_fragments_text  # noqa: E402
from app.services.parsers.epub.footnote_defs import (  # noqa: E402
    extract_footnote_definitions,
    rewrite_footnote_hrefs,
    strip_footnote_blocks,
)
from app.services.text_helpers import html_to_structured_text  # noqa: E402
from app.services.upload_content_store import invalidate_cached_chapters  # noqa: E402

_BACKLINK_FILE_RE = re.compile(r'href="([^"#]+)#noteBack', re.IGNORECASE)


def _chapter_file_name(raw_html: str, idx: int) -> str:
    """Recover the chapter's source file from its defs' backlink hrefs."""
    names = Counter(_BACKLINK_FILE_RE.findall(raw_html))
    if names:
        return names.most_common(1)[0][0]
    return f'ch{idx}.html'


async def main() -> None:
    dry_run = '--dry-run' in sys.argv
    async with async_session() as s:
        rows = (
            (await s.execute(
                select(BookContent).where(
                    BookContent.file_type == 'epub',
                    BookContent.raw_chapters.isnot(None),
                ),
            )).scalars()
        )
        fixed_hashes: dict[str, dict[str, str]] = {}
        n_rows = n_books = 0
        for row in rows:
            chapters = row.raw_chapters or []
            if not any('notecontent' in (ch.get('rawContent') or '') for ch in chapters if isinstance(ch, dict)):
                continue

            file_names = [
                _chapter_file_name(ch.get('rawContent') or '', i)
                for i, ch in enumerate(chapters)
            ]
            file_to_idx: dict[str, int] = {}
            for i, name in enumerate(file_names):
                file_to_idx.setdefault(name, i)

            scoped: dict[str, str] = {}
            changed = False
            for i, ch in enumerate(chapters):
                if not isinstance(ch, dict):
                    continue
                raw = ch.get('rawContent') or ''
                # Extract BEFORE stripping — the notecontent blocks ARE the
                # Layer-1 definition source.
                defs = extract_footnote_definitions(raw, file_names[i])
                stripped = strip_footnote_blocks(raw)
                for frag, body in defs.items():
                    scoped[f'rpfnd-ch{i}-{frag}'] = body
                if stripped == raw:
                    continue
                changed = True
                rewritten = rewrite_footnote_hrefs(stripped, file_names[i], file_to_idx)
                ch['rawContent'] = rewritten
                text = html_to_structured_text(rewritten)
                ch['content'] = coalesce_fragments_text(text)
                ch['wordCount'] = len(text.split())

            if not changed:
                continue
            n_rows += 1
            fixed_hashes[row.content_hash] = scoped
            # JSONB change detection compares the loaded value with the
            # assigned one by equality — in-place mutation of the loaded
            # dicts (or rebuilding an identical-content list) compares
            # equal and the column never lands in the UPDATE. flag_modified
            # is the canonical escape hatch for mutable JSONB.
            row.raw_chapters = [dict(ch) for ch in chapters if isinstance(ch, dict)]
            row.chapters = [
                {k: v for k, v in ch.items() if k != 'rawContent'}
                for ch in chapters if isinstance(ch, dict)
            ]
            flag_modified(row, 'raw_chapters')
            flag_modified(row, 'chapters')
            meta = dict(row.metadata_ or {})
            meta['footnote_definitions'] = scoped
            row.metadata_ = meta

            books = (
                await s.execute(
                    select(Book).where(Book.content_hash == row.content_hash),
                )).scalars().all()
            for book in books:
                bmeta = dict(book.metadata_ or {})
                bmeta['footnote_definitions'] = scoped
                book.metadata_ = bmeta
                await invalidate_cached_chapters(book.id)
                n_books += 1
            print(f'{row.content_hash[:12]}: {len(scoped)} scoped defs, {len(books)} books refreshed')

        if dry_run:
            await s.rollback()
            print(f'dry-run: would fix {n_rows} content rows / {n_books} books')
        else:
            await s.commit()
            print(f'committed: {n_rows} content rows, {n_books} books')


if __name__ == '__main__':
    asyncio.run(main())
