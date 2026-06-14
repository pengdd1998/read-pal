"""Embedding generation via GLM API (OpenAI-compatible /embeddings)."""

import asyncio
import time

import httpx

from app.services.rag._constants import _get_http_client, logger
from app.config import get_settings

MAX_RETRIES = 2
RETRY_DELAY = 0.5


async def _get_embedding(text: str) -> list[float] | None:
    """Get embedding vector from GLM API (OpenAI-compatible /embeddings)."""
    settings = get_settings()
    if not settings.embedding_enabled:
        return None
    if not settings.glm_api_key or settings.glm_api_key == 'dev-key':
        return None

    t0 = time.monotonic()
    for attempt in range(MAX_RETRIES + 1):
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
            embedding = (data.get('data') or [{}])[0].get('embedding')
            if not embedding:
                logger.warning('Embedding API returned unexpected shape: %s', str(data)[:200])
                return None
            return embedding
        except (ConnectionError, TimeoutError, KeyError, ValueError, httpx.HTTPError) as exc:
            # httpx.HTTPError covers HTTPStatusError (429 rate-limit / 5xx) so the
            # 3-tier RAG fallback (semantic -> keyword) degrades gracefully instead
            # of crashing the whole chat when GLM rate-limits the embeddings endpoint.
            if attempt < MAX_RETRIES:
                logger.debug('Embedding attempt %d failed, retrying: %s', attempt + 1, exc)
                await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                continue
            latency_ms = (time.monotonic() - t0) * 1000
            logger.warning(
                'Embedding failed after %d attempts: model=embedding-3 input_len=%d latency=%.0fms error=%s',
                MAX_RETRIES + 1, len(text), latency_ms, exc,
            )
            return None
