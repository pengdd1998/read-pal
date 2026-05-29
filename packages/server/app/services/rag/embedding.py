"""Embedding generation via GLM API (OpenAI-compatible /embeddings)."""

import time

from app.services.rag._constants import _get_http_client, logger
from app.config import get_settings


async def _get_embedding(text: str) -> list[float] | None:
    """Get embedding vector from GLM API (OpenAI-compatible /embeddings)."""
    settings = get_settings()
    if not settings.embedding_enabled:
        return None
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
