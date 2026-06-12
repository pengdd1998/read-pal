"""Pre-compute and store chunk embeddings for a book (called at upload time)."""

from uuid import UUID

from app.config import get_settings
from app.services.rag._constants import logger
from app.services.rag.chunking import _chunk_text
from app.services.rag.embedding import _get_embedding
from app.utils.db import db_error_guard


def _should_skip_precompute(chapters: list[dict], book_id: UUID) -> bool:
    """Return True if precompute should be skipped due to config or input."""
    if not chapters:
        logger.debug('precompute.skip reason=no_chapters book_id=%s', book_id)
        return True

    settings = get_settings()
    if not settings.embedding_enabled:
        logger.debug('precompute.skip reason=disabled book_id=%s', book_id)
        return True
    if not settings.glm_api_key or settings.glm_api_key == 'dev-key':
        logger.debug('precompute.skip reason=no_api_key book_id=%s', book_id)
        return True
    return False


async def _persist_chunks(book_id: UUID, chunks: list) -> None:
    """Write chunk records to the database in a new session."""
    from app.db import async_session
    from sqlalchemy.exc import DBAPIError

    try:
        async with db_error_guard('rag.precompute_book_embeddings', book_id=str(book_id)):
            async with async_session() as session:
                async with session.begin():
                    session.add_all(chunks)
    except (DBAPIError, OSError):
        logger.error('rag precompute failed book_id=%s', book_id, exc_info=True)


async def precompute_book_embeddings(
    book_id: UUID,
    document_id: UUID,
    chapters: list[dict],
) -> None:
    """Pre-compute and store chunk embeddings for a book.

    Called after book upload. Uses its own DB session so it doesn't
    interfere with the upload transaction.
    """
    if _should_skip_precompute(chapters, book_id):
        return

    if not await _preflight_check(book_id, document_id):
        return

    try:
        chunks_to_insert = await _generate_chunks(book_id, document_id, chapters)
    except (ValueError, KeyError, RuntimeError) as exc:
        logger.error('precompute.generation_failed book_id=%s: %s', str(book_id), str(exc))
        return

    await _persist_chunks(book_id, chunks_to_insert)

    embedded = sum(1 for c in chunks_to_insert if c.embedding is not None)
    logger.info(
        'precompute.done book_id=%s total=%d embedded=%d',
        book_id, len(chunks_to_insert), embedded,
    )


async def _check_embedding_column(session, book_id: UUID) -> bool:
    """Verify the book_chunks.embedding column exists with the vector type."""
    from sqlalchemy import text

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
    return True


async def _check_record_exists(session, model, record_id: UUID, label: str, book_id: UUID) -> bool:
    """Verify a record exists by ID; log and return False if missing."""
    from sqlalchemy import select

    result = await session.execute(select(model.id).where(model.id == record_id))
    if result.scalar_one_or_none() is None:
        logger.error(
            'preflight.fail book_id=%s %s_id=%s reason=%s_not_found',
            book_id, label, record_id, label,
        )
        return False
    return True


async def _preflight_check(book_id: UUID, document_id: UUID) -> bool:
    """Validate DB connectivity and schema before making expensive API calls.

    Returns True if everything looks good, False if we should abort early.
    """
    from app.db import async_session
    from app.models.book import Book
    from app.models.document import Document

    try:
        async with async_session() as session:
            if not await _check_embedding_column(session, book_id):
                return False
            if not await _check_record_exists(session, Book, book_id, 'book', book_id):
                return False
            if not await _check_record_exists(session, Document, document_id, 'document', book_id):
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


async def _embed_with_semaphore(
    chunks_to_embed: list[tuple[int, int, str]],
) -> list[list[float] | None]:
    """Embed chunks concurrently with bounded parallelism."""
    import asyncio

    semaphore = asyncio.Semaphore(5)

    async def _embed_one(ch_idx: int, ck_idx: int, text: str):
        async with semaphore:
            return await _embed_chunk(text, ck_idx)

    return await asyncio.gather(
        *[_embed_one(ch_idx, ck_idx, text) for ch_idx, ck_idx, text in chunks_to_embed],
    )


def _build_chunk_objects(
    book_id: UUID,
    document_id: UUID,
    chunks_to_embed: list[tuple[int, int, str]],
    results: list[list[float] | None],
    chunks_no_embed: list[tuple[int, int, str]],
) -> list:
    """Build BookChunk ORM objects from embedded and non-embedded chunks."""
    from app.models.book_chunk import BookChunk

    chunks_to_insert: list[BookChunk] = []
    for i, (ch_idx, ck_idx, text) in enumerate(chunks_to_embed):
        chunks_to_insert.append(BookChunk(
            book_id=book_id, document_id=document_id,
            chapter_index=ch_idx, chunk_index=ck_idx,
            content=text, embedding=results[i],
        ))
    for ch_idx, ck_idx, text in chunks_no_embed:
        chunks_to_insert.append(BookChunk(
            book_id=book_id, document_id=document_id,
            chapter_index=ch_idx, chunk_index=ck_idx,
            content=text, embedding=None,
        ))
    return chunks_to_insert


async def _generate_chunks(
    book_id: UUID,
    document_id: UUID,
    chapters: list[dict],
) -> list:
    """Generate BookChunk objects with embeddings for all chapters."""
    settings = get_settings()
    all_chunks = _split_chapters(chapters)
    max_calls = settings.max_embedding_calls

    chunks_to_embed = all_chunks[:max_calls]
    chunks_no_embed = all_chunks[max_calls:]

    if chunks_no_embed:
        logger.warning(
            'precompute.cap_reached book_id=%s max_calls=%d remaining=%d',
            book_id, max_calls, len(chunks_no_embed),
        )

    results = await _embed_with_semaphore(chunks_to_embed)

    embedding_failures = sum(1 for r in results if r is None)
    if embedding_failures > 0:
        logger.warning(
            'precompute.embedding_failures book_id=%s failures=%d total=%d',
            book_id, embedding_failures, len(all_chunks),
        )

    return _build_chunk_objects(book_id, document_id, chunks_to_embed, results, chunks_no_embed)
