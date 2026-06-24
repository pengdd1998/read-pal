"""Backfill book_chunks embeddings for all existing books.

Usage: python -m scripts.backfill_embeddings [--delay 1.0]
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.db import async_session
from app.models.book import Book
from app.models.book_chunk import BookChunk
from app.models.document import Document

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
logger = logging.getLogger('backfill')


async def backfill(delay: float = 1.0) -> None:
    async with async_session() as session:
        result = await session.execute(
            select(Book.id).where(
                ~Book.id.in_(
                    select(BookChunk.book_id).where(
                        BookChunk.book_id == Book.id,
                    ),
                ),
            ),
        )
        book_ids = [row[0] for row in result.fetchall()]

    logger.info('Found %d books without embeddings', len(book_ids))

    for i, book_id in enumerate(book_ids):
        logger.info('[%d/%d] Processing book %s', i + 1, len(book_ids), book_id)

        async with async_session() as session:
            doc_result = await session.execute(
                select(Document).where(Document.book_id == book_id)
            )
            doc = doc_result.scalar_one_or_none()
            if not doc or not doc.chapters:
                logger.warning('No document/chapters for book %s, skipping', book_id)
                continue

            await _backfill_book(book_id, doc.id, doc.chapters)

        if i < len(book_ids) - 1:
            await asyncio.sleep(delay)

    logger.info('Backfill complete')


async def _backfill_book(
    book_id: UUID,
    document_id: UUID,
    chapters: list,
) -> None:
    from app.services.rag_service import precompute_book_embeddings

    await precompute_book_embeddings(book_id, document_id, chapters)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Backfill book chunk embeddings')
    parser.add_argument('--delay', type=float, default=1.0, help='Delay between books (seconds)')
    args = parser.parse_args()
    asyncio.run(backfill(delay=args.delay))
