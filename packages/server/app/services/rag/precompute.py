"""Pre-compute and store chunk embeddings for a book (called at upload time)."""

from uuid import UUID

from app.config import get_settings
from app.services.rag._constants import logger
from app.services.rag.chunking import _chunk_text
from app.services.rag.embedding import _get_embedding


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
        return

    settings = get_settings()
    if not settings.embedding_enabled:
        logger.debug('Skipping embedding pre-computation: disabled by config')
        return
    if not settings.glm_api_key or settings.glm_api_key == 'dev-key':
        logger.debug('Skipping embedding pre-computation: no API key')
        return

    # Phase 1: collect all text chunks (paragraph-aware)
    all_chunks: list[tuple[int, int, str]] = []
    for ch_idx, chapter in enumerate(chapters):
        title = chapter.get('title', '')
        content = chapter.get('content', '')
        # Chunk content only so paragraphs are detected correctly,
        # then prepend title as context prefix for embedding quality.
        for ck_idx, chunk in enumerate(_chunk_text(content)):
            prefixed = f'[{title}]\n{chunk}' if title else chunk
            all_chunks.append((ch_idx, ck_idx, prefixed))

    # Phase 2: generate embeddings up to the cap
    max_calls = settings.max_embedding_calls
    chunks_to_insert: list[BookChunk] = []
    api_calls = 0
    capped = False

    for ch_idx, ck_idx, chunk in all_chunks:
        embedding = None
        if not capped:
            embedding = await _get_embedding(chunk)
            api_calls += 1
            if api_calls >= max_calls:
                capped = True
                logger.warning(
                    'Embedding cap reached (%d) for book %s — remaining chunks stored without embeddings',
                    max_calls, book_id,
                )

        chunks_to_insert.append(
            BookChunk(
                book_id=book_id,
                document_id=document_id,
                chapter_index=ch_idx,
                chunk_index=ck_idx,
                content=chunk,
                embedding=embedding,
            ),
        )

    async with async_session() as session:
        async with session.begin():
            session.add_all(chunks_to_insert)

    logger.info(
        'Stored %d chunks for book %s (%d with embeddings, cap=%d)',
        len(chunks_to_insert),
        book_id,
        sum(1 for c in chunks_to_insert if c.embedding is not None),
        max_calls,
    )
