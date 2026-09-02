"""Merge legacy duplicate books that provably share identical content.

Design r2 step 2 (backfill): books uploaded before the content-hash era
have NULL content_hash and one Document each. This script merges groups
whose Documents are PROVABLY identical (same title+author, byte-identical
serialized chapters) into one canonical book_contents row; every book in
the group then references it.

Canonical hash = 64-char SHA-256 of ``json.dumps(chapters, sort_keys=True,
ensure_ascii=False)`` — fits String(64). It hashes the parse payload, not
raw file bytes, so it cannot collide with upload-time SHA-256s. Provenance
lives in ``book_contents.metadata_.legacy_backfill``.

Documents are NOT deleted (design keeps the legacy read path); books keep
their rows, only ``content_hash`` is stamped.

Dry-run by default. ``--apply`` writes in ONE transaction, records a
backup + revert SQL under ``backups/`` (gitignored) first, and invalidates
affected users' stats caches after commit (P6.1: every write path touching
books must invalidate).

Usage::

    cd packages/server && uv run python scripts/dedupe_legacy_books.py           # report
    uv run python scripts/dedupe_legacy_books.py --apply                          # merge
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

sys.path.insert(0, 'app/..')

from sqlalchemy import select, text  # noqa: E402

from app.db import async_session  # noqa: E402
from app.models.book import Book  # noqa: E402
from app.models.document import Document  # noqa: E402

logger = logging.getLogger('read-pal.dedupe-backfill')

BACKUP_DIR = Path('backups')


def _fingerprint(doc: Document) -> str | None:
    """Byte-proof fingerprint of a Document's chapters (None if empty)."""
    if not doc.chapters:
        return None
    canonical = json.dumps(doc.chapters, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _write_backup(plan: list[dict]) -> Path:
    """Record pre-state + revert SQL before any write. backups/ is gitignored."""
    BACKUP_DIR.mkdir(exist_ok=True)
    path = BACKUP_DIR / f"dedupe-backup-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.json"
    revert_parts = []
    for group in plan:
        ids = ', '.join(f"'{b['id']}'" for b in group['books'])
        revert_parts.append(
            f"UPDATE books SET content_hash = NULL WHERE id IN ({ids});"
        )
    path.write_text(json.dumps({
        'created_at': datetime.now(UTC).isoformat(),
        'note': ('Revert = re-NULL the stamps; leave the book_contents rows '
                 '(content-only, unreferenced once stamps are gone).'),
        'groups': plan,
        'revert_sql': '\n'.join(revert_parts),
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    return path


async def _plan_groups(s) -> list[dict]:
    """Find byte-identical legacy duplicate groups (read-only)."""
    rows = (await s.execute(text("""
        SELECT b.title, b.author
        FROM books b
        WHERE b.content_hash IS NULL
        GROUP BY b.title, b.author
        HAVING count(*) > 1
        ORDER BY count(*) DESC
    """))).all()

    plan: list[dict] = []
    for title, author in rows:
        docs = (await s.execute(
            select(Book, Document)
            .join(Document, Document.book_id == Book.id)
            .where(Book.title == title, Book.author == author,
                   Book.content_hash.is_(None))
        )).all()

        by_fp: dict[str, list[tuple[Book, Document]]] = {}
        for book, doc in docs:
            fp = _fingerprint(doc)
            if fp:
                by_fp.setdefault(fp, []).append((book, doc))

        for fp, members in by_fp.items():
            if len(members) < 2:
                continue
            plan.append({
                'title': title,
                'author': author,
                'content_hash': fp,
                'books': [
                    {'id': str(b.id), 'user_id': str(b.user_id),
                     'title': b.title, 'author': b.author}
                    for b, _ in members
                ],
            })
    return plan


async def _apply_plan(s, plan: list[dict]) -> None:
    """Insert shared book_contents rows + stamp all member books."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from app.models.book_content import BookContent

    for group in plan:
        keeper = group['books'][0]
        keeper_doc = (await s.execute(
            select(Document).where(Document.book_id == UUID(keeper['id']))
        )).scalar_one()
        await s.execute(pg_insert(BookContent).values(
            content_hash=group['content_hash'],
            file_size=0,  # unknown for legacy parses; informational only
            file_type='epub',
            title=group['title'],
            author=group['author'],
            chapters=keeper_doc.chapters,
            raw_chapters=keeper_doc.chapters,
            total_pages=len(keeper_doc.chapters or []),
            metadata_={'legacy_backfill': True},
        ).on_conflict_do_nothing(index_elements=['content_hash']))
        for member in group['books']:
            await s.execute(text(
                "UPDATE books SET content_hash = :h WHERE id = :i"
            ), {'h': group['content_hash'], 'i': member['id']})


async def _invalidate_affected_users(plan: list[dict]) -> int:
    from app.services.stats.dashboard_cache import invalidate_user_caches

    uids = {b['user_id'] for g in plan for b in g['books']}
    for uid in uids:
        await invalidate_user_caches(UUID(uid))
    return len(uids)


async def main(apply: bool) -> None:
    async with async_session() as s:
        plan = await _plan_groups(s)
        redundant = sum(len(g['books']) - 1 for g in plan)
        stamped = sum(len(g['books']) for g in plan)

        if not apply:
            for group in plan:
                print(f"[dry] {group['title'][:32]!r} "
                      f"x{len(group['books'])} → {group['content_hash'][:16]}…")
            print(f"DRY-RUN: {len(plan)} groups, {stamped} books stampable, "
                  f"{redundant} redundant copies")
            return

        if not plan:
            print("Nothing to merge.")
            return

        backup_path = _write_backup(plan)
        print(f"Backup written: {backup_path}")

        await _apply_plan(s, plan)
        await s.commit()  # single all-or-nothing transaction

    users = await _invalidate_affected_users(plan)
    print(f"APPLIED: {len(plan)} groups, {stamped} books stamped "
          f"({redundant} redundant copies eliminated), "
          f"{users} users' caches invalidated")


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main('--apply' in sys.argv))
