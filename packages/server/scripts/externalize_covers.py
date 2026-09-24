"""Externalize inline base64 covers into object storage (disk optimization).

books.metadata.cover_data_uri held the full extracted cover inline on
every row (~140 kB each, 99% of the books table's disk) even after the
OSS copy existed — the upload path only ever read it once and never
popped it. New uploads pop it (same PR); this script migrates the
existing rows: decode → upload to OSS (public URL via the configured
OSS_PUBLIC_BASE_URL) → fill books.cover_url when empty → strip the key
from BOTH books.metadata and the owning book_contents.metadata row.

Safety: the key is stripped only after a successful upload; a row whose
upload fails keeps its inline copy and is reported. Runs inside the api
container:

    python scripts/externalize_covers.py           # migrate
    python scripts/externalize_covers.py --dry-run # report only
"""
from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, '.')

from sqlalchemy import select, text  # noqa: E402

from app.db import async_session  # noqa: E402
from app.models.book import Book  # noqa: E402
from app.models.book_content import BookContent  # noqa: E402
from app.services.object_storage import upload_cover  # noqa: E402
from app.services.upload_service import _decode_cover_data_uri  # noqa: E402


def _strip_key(meta: dict | None) -> dict | None:
    if not meta or 'cover_data_uri' not in meta:
        return meta
    return {k: v for k, v in meta.items() if k != 'cover_data_uri'}


async def main() -> None:
    dry_run = '--dry-run' in sys.argv
    migrated = kept_inline = failed = 0
    async with async_session() as db:
        books = (await db.execute(
            select(Book).where(text("metadata ? 'cover_data_uri'")),
        )).scalars().all()
        print(f'books with inline cover: {len(books)}', flush=True)
        for book in books:
            uri = (book.metadata_ or {}).get('cover_data_uri')
            decoded = _decode_cover_data_uri(uri) if uri else None
            url = None
            if dry_run:
                print(f'  dry {str(book.id)[:8]} cover_url={bool(book.cover_url)}', flush=True)
                continue
            if decoded:
                data, ext, mime = decoded
                try:
                    url = await upload_cover(book.id, data, ext, mime)
                except Exception as exc:  # noqa: BLE001 — one book must not stop the sweep
                    print(f'  FAIL {str(book.id)[:8]}: {str(exc)[:120]}', flush=True)
            if url:
                if not book.cover_url:
                    book.cover_url = url
                book.metadata_ = _strip_key(book.metadata_)
                if book.content_hash:
                    shared = (await db.execute(
                        select(BookContent).where(
                            BookContent.content_hash == book.content_hash),
                    )).scalar_one_or_none()
                    if shared is not None:
                        shared.metadata_ = _strip_key(shared.metadata_)
                migrated += 1
            elif book.cover_url:
                # OSS copy already reachable — the inline copy is dead weight.
                book.metadata_ = _strip_key(book.metadata_)
                migrated += 1
            else:
                failed += 1
                print(f'  KEEP {str(book.id)[:8]}: upload failed, inline retained', flush=True)
        if not dry_run:
            await db.commit()
    print(f'DONE: migrated={migrated} kept_inline={kept_inline} failed={failed}', flush=True)


if __name__ == '__main__':
    asyncio.run(main())
