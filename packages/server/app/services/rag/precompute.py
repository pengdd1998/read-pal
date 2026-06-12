"""Pre-compute and store chunk embeddings for a book (called at upload time)."""

from uuid import UUID

from app.config import get_settings
from app.services.rag._constants import logger
from app.services.rag.chunking import _chunk_text
from app.services.rag.embedding import _get_embedding
from app.utils.db import db_error_guard


async def precompute_book_embeddings(
    book_id: UUID,
    document_id: UUID,
    chapters: list[dict],
) -> None:
    """Pre-compute and store chunk embeddings for a book.

    Called after book upload. Uses its own DB session so it doesn't
    interfere with the upload transaction.
    """
    from app.db import async_session
    from app.models.book_chunk import BookChunk

    if not chapters:
        logger.debug('precompute.skip reason=no_chapters book_id=%s', book_id)
        return

    settings = get_settings()
    if not settings.embedding_enabled:
        logger.debug('precompute.skip reason=disabled book_id=%s', book_id)
        return
    if not settings.glm_api_key or settings.glm_api_key == 'dev-key':
        logger.debug('precompute.skip reason=no_api_key book_id=%s', book_id)
        return

    # --- Pre-flight: validate DB is reachable and schema is compatible ---
    # Do this BEFORE calling the paid embedding API to avoid wasting money
    # if the DB write will fail anyway.
    if not await _preflight_check(book_id, document_id):
        return

    # --- Expensive operation: call embedding API ---
    try:
        _chunks_to_insert = await _generate_chunks(book_id, document_id, chapters)
    except (ValueError, KeyError, RuntimeError) as exc:
        logger.error('precompute.generation_failed book_id=%s: %s', str(book_id), str(exc))
        return

    # --- Persist results ---
    try:
        async with db_error_guard('rag.precompute_book_embeddings', book_id=str(book_id)):
            async with async_session() as session:
                async with session.begin():
                    session.add_all(_chunks_to_insert)
    except (DBAPIError, OSError):
        logger.error('rag precompute failed book_id=%s', book_id, exc_info=True)
        return

    embedded = sum(1 for c in _chunks_to_insert if c.embedding is not None)
    logger.info(
        'precompute.done book_id=%s total=%d embedded=%d',
        book_id, len(_chunks_to_insert), embedded,
    )


async def _preflight_check(book_id: UUID, document_id: UUID) -> bool:
    """Validate DB connectivity and schema before making expensive API calls.

    Returns True if everything looks good, False if we should abort early.
    """
    from app.db import async_session
    from app.models.book_chunk import BookChunk
    from sqlalchemy import text, select

    try:
        async with async_session() as session:
            # 1. Verify the book_chunks table exists and has the expected schema
            #    (pgvector extension loaded, embedding column is vector type)
            result = await session.execute(text(
                "SELECT data_type, udt_name FROM information_schema.columns "
                "WHERE table_name = 'book_chunks' AND column_name = 'embedding'"
            ))
            col_info = result.first()
            if col_info is None:
                logger.error(
                    'preflight.fail book_id=%s reason=embedding_column_missing',
                    book_id,
                )
                return False
            if col_info.udt_name != 'vector':
                logger.error(
                    'preflight.fail book_id=%s reason=wrong_embedding_type udt=%s expected=vector',
                    book_id, col_info.udt_name,
                )
                return False

            # 2. Verify the book record exists (FK constraint would fail otherwise)
            from app.models.book import Book
            result = await session.execute(
                select(Book.id).where(Book.id == book_id)
            )
            if result.scalar_one_or_none() is None:
                logger.error(
                    'preflight.fail book_id=%s reason=book_not_found', book_id,
                )
                return False

            # 3. Verify the document record exists
            from app.models.document import Document
            result = await session.execute(
                select(Document.id).where(Document.id == document_id)
            )
            if result.scalar_one_or_none() is None:
                logger.error(
                    'preflight.fail book_id=%s doc_id=%s reason=document_not_found',
                    book_id, document_id,
                )
                return False

    except Exception:
        logger.error('preflight.fail book_id=%s reason=db_error', book_id, exc_info=True)
        return False

    logger.debug('preflight.ok book_id=%s', book_id)
    return True


def _split_chapters(chapters: list[dict]) -> list[tuple[int, int, str]]:
    """Split chapter contents into prefixed text chunks."""
    all_chunks: list[tuple[int, int, str]] = []
    for ch_idx, chapter in enumerate(chapters):
        title = chapter.get('title', '')
        content = chapter.get('content', '')
        for ck_idx, chunk in enumerate(_chunk_text(content)):
            prefixed = f'[{title}]\n{chunk}' if title else chunk
            all_chunks.append((ch_idx, ck_idx, prefixed))
    return all_chunks


async def _embed_chunk(
    chunk: str,
    chunk_index: int,
) -> list[float] | None:
    """Get embedding for a single chunk, returning None on failure."""
    try:
        return await _get_embedding(chunk)
    except (ValueError, RuntimeError, ConnectionError) as exc:
        logger.warning('precompute.embedding_failed chunk_index=%s: %s', chunk_index, str(exc))
        return None


async def _generate_chunks(
    book_id: UUID,
    document_id: UUID,
    chapters: list[dict],
) -> list:
    """Generate BookChunk objects with embeddings for all chapters."""
    import asyncio
    from app.models.book_chunk import BookChunk

    settings = get_settings()
    all_chunks = _split_chapters(chapters)
    max_calls = settings.max_embedding_calls

    # Pre-slice to max_calls to respect embedding budget
    chunks_to_embed = all_chunks[:max_calls]
    chunks_no_embed = all_chunks[max_calls:]

    if chunks_no_embed:
        logger.warning(
            'precompute.cap_reached book_id=%s max_calls=%d remaining=%d',
            book_id, max_calls, len(chunks_no_embed),
        )

    # Concurrent embedding with bounded parallelism (P1-6)
    semaphore = asyncio.Semaphore(5)

    async def _embed_one(ch_idx: int, ck_idx: int, text: str):
        async with semaphore:
            return await _embed_chunk(text, ck_idx)

    results = await asyncio.gather(
        *[_embed_one(ch_idx, ck_idx, text) for ch_idx, ck_idx, text in chunks_to_embed],
    )

    embedding_failures = sum(1 for r in results if r is None)

    chunks_to_insert: list[BookChunk] = []
    for i, (ch_idx, ck_idx, text) in enumerate(chunks_to_embed):
        chunks_to_insert.append(BookChunk(
            book_id=book_id, document_id=document_id,
            chapter_index=ch_idx, chunk_index=ck_idx,
            content=text, embedding=results[i],
        ))
    # Remaining chunks without embeddings
    for ch_idx, ck_idx, text in chunks_no_embed:
        chunks_to_insert.append(BookChunk(
            book_id=book_id, document_id=document_id,
            chapter_index=ch_idx, chunk_index=ck_idx,
            content=text, embedding=None,
        ))

    if embedding_failures > 0:
        logger.warning(
            'precompute.embedding_failures book_id=%s failures=%d total=%d',
            book_id, embedding_failures, len(all_chunks),
        )

    return chunks_to_insert
