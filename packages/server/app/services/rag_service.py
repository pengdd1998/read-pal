"""RAG service — retrieve relevant book content for AI chat enrichment.

Strategy tiers (auto-degrading):
  1. Semantic search via GLM embeddings + cosine similarity (passage-level chunks)
  2. Keyword matching fallback when embeddings unavailable
Results are cached in Redis per (book, query) for 30 minutes.
"""

import asyncio
import hashlib
import json
import logging
import math
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.redis import get_redis
from app.models.annotation import Annotation
from app.models.book import Book
from app.models.document import Document
from app.utils.sanitizer import sanitize_user_input

logger = logging.getLogger('read-pal.rag')

RAG_CACHE_PREFIX = 'rag:'
RAG_EMBED_CACHE_PREFIX = 'rag:emb:'
RAG_CACHE_TTL = 1800  # 30 min
EMBED_CACHE_TTL = 86400  # 24 hrs — chunk embeddings are stable

# Pooled HTTP client for embedding requests
_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=10)
    return _http_client


def _stable_hash(text: str) -> str:
    """Stable hash for cache keys (survives process restarts)."""
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
        # Try to break at sentence/paragraph boundary
        for sep in ['\n\n', '\n', '. ', '。', '！', '？']:
            last_sep = chunk.rfind(sep)
            if last_sep > chunk_size * 0.5:
                chunk = chunk[:last_sep + len(sep)]
                break
        chunks.append(chunk.strip())
        start += len(chunk) - overlap
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

    try:
        client = _get_http_client()
        resp = await client.post(
            f'{settings.glm_base_url}/embeddings',
            headers={'Authorization': f'Bearer {settings.glm_api_key}'},
            json={'model': 'embedding-3', 'input': text[:2000]},
        )
        resp.raise_for_status()
        data = resp.json()
        return data['data'][0]['embedding']
    except Exception as exc:
        logger.debug('Embedding request failed: %s', exc)
        return None


async def _get_chunk_embeddings(
    chapter: dict,
    book_id: UUID,
) -> list[tuple[str, list[float]]]:
    """Get cached or fresh embeddings for all chunks of a chapter.

    Returns a list of (chunk_text, embedding) tuples.
    """
    title = chapter.get('title', '')
    content = chapter.get('content', '')
    full_text = f'{title} {content}'
    chunks = _chunk_text(full_text)

    if not chunks:
        return []

    r = get_redis()
    results: list[tuple[str, list[float]]] = []

    for idx, chunk in enumerate(chunks):
        cache_key = (
            f'{RAG_EMBED_CACHE_PREFIX}{book_id}:'
            f'{_stable_hash(title)}:{idx}:{_stable_hash(chunk[:500])}'
        )
        emb: list[float] | None = None

        try:
            cached = await r.get(cache_key)
            if cached:
                emb = json.loads(cached)
        except Exception as exc:
            logger.warning('Redis embedding cache read failed: %s', exc)

        if emb is None:
            emb = await _get_embedding(chunk)
            if emb:
                try:
                    await r.setex(cache_key, EMBED_CACHE_TTL, json.dumps(emb))
                except Exception as exc:
                    logger.warning('Redis embedding cache write failed: %s', exc)

        if emb is not None:
            results.append((chunk, emb))

    return results


def _cosine_sim(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


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
    # Check Redis cache first
    cache_key = f'{RAG_CACHE_PREFIX}{book_id}:{user_id}:{_stable_hash(query)}'
    try:
        cached = await get_redis().get(cache_key)
        if cached:
            return cached[:max_chars]
    except Exception as exc:
        logger.warning('Redis RAG cache read failed: %s', exc)

    # Load book
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id)
    )
    book = result.scalar_one_or_none()
    if not book:
        return ''

    chapters = await _get_chapters(db, book_id)

    # Try semantic search first (returns chunks with chapter metadata)
    relevant_chunks = await _semantic_chapter_search(chapters, query, book_id, top_k=3)

    # Fallback to keyword matching
    if not relevant_chunks and chapters:
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

    # Related annotations
    annotations = await _load_related_annotations(db, user_id, book_id, query, limit=5)
    for ann in annotations:
        label = ann.type.value if hasattr(ann.type, 'value') else str(ann.type)
        entry = f'[{label}] {ann.content}'
        if ann.note:
            entry += f' (note: {ann.note})'
        context_parts.append(entry)

    combined = '\n\n'.join(context_parts)[:max_chars]

    # Cache result
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
    chapters: list[dict[str, Any]],
    query: str,
    book_id: UUID,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """Embedding-based passage search across all chapter chunks."""
    query_emb = await _get_embedding(query)
    if query_emb is None:
        return []

    # Fetch all chunk embeddings in parallel (one call per chapter)
    all_chunk_results = await asyncio.gather(
        *[_get_chunk_embeddings(ch, book_id) for ch in chapters],
    )

    scored: list[tuple[float, dict]] = []
    for ch, chunk_list in zip(chapters, all_chunk_results):
        for chunk_text, chunk_emb in chunk_list:
            sim = _cosine_sim(query_emb, chunk_emb)
            if sim > 0.3:
                scored.append((sim, {
                    'title': ch.get('title', 'Untitled'),
                    'content': chunk_text,
                }))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:top_k]]


def _keyword_chapter_search(
    chapters: list[dict[str, Any]],
    query: str,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """Keyword-based chapter relevance scoring. Supports both word-level (Latin) and character-level (CJK) matching."""
    import re
    query_lower = query.lower()
    # Split into tokens: CJK characters individually, Latin words by whitespace
    tokens: set[str] = set()
    for part in re.findall(r'[一-鿿]|[a-zA-Z0-9]+', query_lower):
        tokens.add(part)

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
    """Fetch chapters from the Document table (not Book.metadata_)."""
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
    import re
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

    # CJK-aware tokenization: individual CJK chars + Latin words
    tokens: set[str] = set()
    for part in re.findall(r'[一-鿿]|[a-zA-Z0-9]+', query.lower()):
        tokens.add(part)

    scored = []
    for ann in all_annotations:
        text = f'{ann.content} {ann.note or ""}'.lower()
        overlap = sum(1 for tok in tokens if tok in text)
        if overlap > 0:
            scored.append((overlap, ann))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [ann for _, ann in scored[:limit]]
