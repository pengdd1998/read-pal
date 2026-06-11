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
        logger.debug('precompute.skip', reason='no_chapters', book_id=str(book_id))
        return

    settings = get_settings()
    if not settings.embedding_enabled:
        logger.debug('precompute.skip', reason='disabled', book_id=str(book_id))
        return
    if not settings.glm_api_key or settings.glm_api_key == 'dev-key':
        logger.debug('precompute.skip', reason='no_api_key', book_id=str(book_id))
        return

    try:
        _chunks_to_insert = await _generate_chunks(book_id, document_id, chapters)
    except (ValueError, KeyError, RuntimeError) as exc:
        logger.error('precompute.generation_failed book_id=%s: %s', str(book_id), str(exc))
        return

    try:
        async with db_error_guard('rag.precompute_book_embeddings', book_id=str(book_id)):
            async with async_session() as session:
                async with session.begin():
                    session.add_all(_chunks_to_insert)
    except Exception:
        return

    embedded = sum(1 for c in _chunks_to_insert if c.embedding is not None)
    logger.info(
        'precompute.done', book_id=str(book_id),
        total=len(_chunks_to_insert), embedded=embedded,
    )


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
    from app.models.book_chunk import BookChunk

    settings = get_settings()
    all_chunks = _split_chapters(chapters)
    max_calls = settings.max_embedding_calls

    chunks_to_insert: list[BookChunk] = []
    api_calls = 0
    capped = False
    embedding_failures = 0

    for ch_idx, ck_idx, chunk_text in all_chunks:
        embedding = None
        if not capped:
            embedding = await _embed_chunk(chunk_text, ck_idx)
            if embedding is None:
                embedding_failures += 1
            api_calls += 1
            if api_calls >= max_calls:
                capped = True
                logger.warning(
                    'precompute.cap_reached', book_id=str(book_id),
                    max_calls=max_calls,
                    remaining=len(all_chunks) - len(chunks_to_insert) - 1,
                )

        chunks_to_insert.append(BookChunk(
            book_id=book_id, document_id=document_id,
            chapter_index=ch_idx, chunk_index=ck_idx,
            content=chunk_text, embedding=embedding,
        ))

    if embedding_failures > 0:
        logger.warning(
            'precompute.embedding_failures', book_id=str(book_id),
            failures=embedding_failures, total=len(all_chunks),
        )

    return chunks_to_insert
