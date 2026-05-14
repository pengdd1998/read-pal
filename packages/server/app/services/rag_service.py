"""RAG service — retrieve relevant book content for AI chat enrichment.

Strategy tiers (auto-degrading):
  1. Semantic search via pgVector cosine similarity (pre-computed embeddings)
  2. Keyword matching fallback when embeddings unavailable
Results are cached in Redis per (book, query) for 30 minutes.
"""

import asyncio
import hashlib
import logging
import re
import time
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.redis import get_redis
from app.models.annotation import Annotation
from app.models.book import Book
from app.models.document import Document
from app.utils.sanitizer import sanitize_user_input

logger = logging.getLogger('read-pal.rag')

_CJK_TOKEN_RE = re.compile(r'[一-鿿]|[a-zA-Z0-9]+')

RAG_CACHE_PREFIX = 'rag:'
RAG_CACHE_TTL = 1800  # 30 min

_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=10)
    return _http_client


def _stable_hash(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def _chunk_text(text: str, chunk_size: int = 2000, overlap: int = 256) -> list[str]:
    """Split text into overlapping chunks for better RAG retrieval."""
    if not text or len(text) <= chunk_size:
        return [text] if text else []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        for sep in ['\n\n', '\n', '. ', '。', '！', '？']:
            last_sep = chunk.rfind(sep)
            if last_sep > chunk_size * 0.5:
                chunk = chunk[:last_sep + len(sep)]
                break
        chunks.append(chunk.strip())
        start += max(len(chunk) - overlap, 1)
        if start >= len(text):
            break
    return [c for c in chunks if len(c) > 50]


# ---------------------------------------------------------------------------
# Embedding helpers
# ---------------------------------------------------------------------------

async def _get_embedding(text: str) -> list[float] | None:
    """Get embedding vector from GLM API (OpenAI-compatible /embeddings)."""
    settings = get_settings()
    if not settings.glm_api_key or settings.glm_api_key == 'dev-key':
        return None

    t0 = time.monotonic()
    try:
        client = _get_http_client()
        resp = await client.post(
            f'{settings.glm_base_url}/embeddings',
            headers={'Authorization': f'Bearer {settings.glm_api_key}'},
            json={'model': 'embedding-3', 'input': text[:2000], 'dimensions': 1024},
        )
        resp.raise_for_status()
        data = resp.json()
        latency_ms = (time.monotonic() - t0) * 1000
        logger.info(
            'Embedding API success: model=embedding-3 input_len=%d dims=1024 latency=%.0fms',
            len(text), latency_ms,
        )
        return data['data'][0]['embedding']
    except Exception as exc:
        latency_ms = (time.monotonic() - t0) * 1000
        logger.error(
            'Embedding API failed: model=embedding-3 input_len=%d latency=%.0fms error=%s',
            len(text), latency_ms, exc,
        )
        return None


# ---------------------------------------------------------------------------
# Pre-computation (called at upload time)
# ---------------------------------------------------------------------------

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
    if not settings.glm_api_key or settings.glm_api_key == 'dev-key':
        logger.debug('Skipping embedding pre-computation: no API key')
        return

    chunks_to_insert: list[BookChunk] = []

    for ch_idx, chapter in enumerate(chapters):
        title = chapter.get('title', '')
        content = chapter.get('content', '')
        full_text = f'{title} {content}'
        text_chunks = _chunk_text(full_text)

        for ck_idx, chunk in enumerate(text_chunks):
            embedding = await _get_embedding(chunk)
            chunks_to_insert.append(
                BookChunk(
                    book_id=book_id,
                    document_id=document_id,
                    chapter_index=ch_idx,
                    chunk_index=ck_idx,
                    content=chunk,
                    embedding=embedding,
                )
            )

        if ch_idx < len(chapters) - 1:
            await asyncio.sleep(0.2)

    async with async_session() as session:
        async with session.begin():
            session.add_all(chunks_to_insert)

    logger.info(
        'Stored %d chunks for book %s (%d with embeddings)',
        len(chunks_to_insert),
        book_id,
        sum(1 for c in chunks_to_insert if c.embedding is not None),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_book_context(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    query: str,
    max_chars: int = 3000,
) -> str:
    """Retrieve relevant book content for enriching AI chat.

    Tries semantic search first, falls back to keyword matching.
    """
    cache_key = f'{RAG_CACHE_PREFIX}{book_id}:{user_id}:{_stable_hash(query)}'
    try:
        cached = await get_redis().get(cache_key)
        if cached:
            return cached[:max_chars]
    except Exception as exc:
        logger.warning('Redis RAG cache read failed: %s', exc)

    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id)
    )
    book = result.scalar_one_or_none()
    if not book:
        return ''

    relevant_chunks = await _semantic_chapter_search(db, book_id, query, top_k=3)

    if not relevant_chunks:
        chapters = await _get_chapters(db, book_id)
        if chapters:
            relevant_chunks = _keyword_chapter_search(chapters, query, top_k=3)

    context_parts: list[str] = []

    for item in relevant_chunks:
        chunk_text = item.get('content', '')
        if not chunk_text:
            continue
        header = f"[Chapter: {item.get('title', 'Untitled')}]"
        sanitized = sanitize_user_input(
            chunk_text[:max_chars], max_length=max_chars, context='rag_chapter',
        )
        context_parts.append(f'{header}\n{sanitized}')

    annotations = await _load_related_annotations(db, user_id, book_id, query, limit=5)
    for ann in annotations:
        label = ann.type.value if hasattr(ann.type, 'value') else str(ann.type)
        entry = f'[{label}] {ann.content}'
        if ann.note:
            entry += f' (note: {ann.note})'
        context_parts.append(entry)

    combined = '\n\n'.join(context_parts)[:max_chars]

    if combined:
        try:
            await get_redis().setex(cache_key, RAG_CACHE_TTL, combined)
        except Exception as exc:
            logger.warning('Redis RAG cache write failed: %s', exc)

    return combined


# ---------------------------------------------------------------------------
# Search strategies
# ---------------------------------------------------------------------------

async def _semantic_chapter_search(
    db: AsyncSession,
    book_id: UUID,
    query: str,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """pgVector cosine distance search over pre-computed chunk embeddings."""
    query_emb = await _get_embedding(query)
    if query_emb is None:
        return []

    emb_literal = '[' + ','.join(str(v) for v in query_emb) + ']'
    distance_threshold = 0.7  # 1 - similarity_threshold(0.3)

    try:
        stmt = text("""
            SELECT
                bc.chapter_index,
                bc.content,
                d.chapters,
                1 - (bc.embedding <=> :query_emb::vector) AS similarity
            FROM book_chunks bc
            JOIN documents d ON d.id = bc.document_id
            WHERE bc.book_id = :book_id
              AND bc.embedding IS NOT NULL
              AND (bc.embedding <=> :query_emb::vector) < :distance_threshold
            ORDER BY bc.embedding <=> :query_emb::vector
            LIMIT :limit
        """)
        result = await db.execute(
            stmt,
            {
                'query_emb': emb_literal,
                'book_id': str(book_id),
                'distance_threshold': distance_threshold,
                'limit': top_k,
            },
        )
        rows = result.fetchall()
    except Exception as exc:
        logger.warning('pgVector search failed: %s', exc)
        return []

    results = []
    for row in rows:
        chapter_index = row[0]
        chapters = row[2]
        chapter_title = 'Untitled'
        if isinstance(chapters, list) and 0 <= chapter_index < len(chapters):
            chapter_title = chapters[chapter_index].get('title', 'Untitled')

        results.append({
            'title': chapter_title,
            'content': row[1],
            'similarity': float(row[3]),
        })

    return results


def _tokenize_query(query: str) -> set[str]:
    return set(_CJK_TOKEN_RE.findall(query.lower()))


def _keyword_chapter_search(
    chapters: list[dict[str, Any]],
    query: str,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """Keyword-based chapter relevance scoring."""
    tokens = _tokenize_query(query)

    scored: list[tuple[float, dict]] = []
    for ch in chapters:
        full_content = ch.get('content', '')
        chunks = _chunk_text(full_content) if full_content else []
        title = ch.get('title', '')
        for chunk in chunks:
            text = f"{title} {chunk}".lower()
            overlap = sum(1 for tok in tokens if tok in text)
            if overlap > 0:
                scored.append((overlap, {
                    'title': title or 'Untitled',
                    'content': chunk,
                }))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:top_k]]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_chapters(db: AsyncSession, book_id: UUID) -> list[dict[str, Any]]:
    """Fetch chapters from the Document table."""
    result = await db.execute(
        select(Document.chapters).where(Document.book_id == book_id)
    )
    chapters = result.scalar_one_or_none()
    if isinstance(chapters, list):
        return chapters
    return []


async def _load_related_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    query: str,
    limit: int = 5,
) -> list[Annotation]:
    """Load annotations with keyword overlap to the query."""
    result = await db.execute(
        select(Annotation)
        .where(
            Annotation.user_id == user_id,
            Annotation.book_id == book_id,
        )
        .order_by(Annotation.created_at.desc())
        .limit(50)
    )
    all_annotations = list(result.scalars().all())

    tokens = _tokenize_query(query)

    scored = []
    for ann in all_annotations:
        text = f'{ann.content} {ann.note or ""}'.lower()
        overlap = sum(1 for tok in tokens if tok in text)
        if overlap > 0:
            scored.append((overlap, ann))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [ann for _, ann in scored[:limit]]
