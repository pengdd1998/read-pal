"""Embedding generation via any OpenAI-compatible /embeddings endpoint.

Default provider: GLM (embedding-3). Point EMBEDDING_BASE_URL /
EMBEDDING_MODEL at a local Ollama (e.g. bge-m3) or any other
OpenAI-compatible vendor via settings — the payload shape is identical.

Batch-first: the endpoint accepts an array of texts and returns one
vector per index. Upload-time precompute used to fire ONE request per
chunk (81 chunks × 5-way concurrency × 3 retries ≈ 243 requests) which
the account-level rate limiter answered with a 429 storm — 13/13 observed
uploads ended with embedded=0 (2026-09-02 log evidence) and the burst
starved the chat models on the same account. Batching cuts that to ~6
sequential requests per book.
"""

import asyncio
import time

import httpx

from app.services.rag._constants import _get_http_client, logger
from app.config import get_settings

MAX_RETRIES = 2
# 429s from an already-throttled account need real breathing room; the old
# 0.5s/1.0s schedule retried straight back into the limiter.
RETRY_DELAYS = (2.0, 6.0)
# GLM accepts larger batches; 16 keeps request bodies ~32KB and failures
# cheap (one failed batch strands at most 16 chunks).
BATCH_SIZE = 16
PAUSE_BETWEEN_BATCHES_S = 0.3
# Above this, truncation distorts vectors — matches the historical GLM path.
MAX_INPUT_CHARS = 2000


def _resolve_provider() -> tuple[str, str, str]:
    """(base_url, api_key, model) with GLM as the legacy fallback."""
    s = get_settings()
    base = (s.embedding_base_url or s.glm_base_url).rstrip('/')
    key = s.embedding_api_key or s.glm_api_key
    return base, key, s.embedding_model


def _provider_unusable(base: str, key: str) -> bool:
    """No key, or a placeholder key aimed at a real (remote) vendor.

    A localhost provider (Ollama) needs no key, so the placeholder guard
    only applies to remote endpoints.
    """
    if not key or key == 'dev-key':
        return 'localhost' not in base and '127.0.0.1' not in base
    return False


def _request_payload(texts: list[str], model: str) -> dict:
    return {
        'model': model,
        'input': [t[:MAX_INPUT_CHARS] for t in texts],
        'dimensions': 1024,
    }


def _parse_vectors(data: dict, expected: int) -> list[list[float] | None]:
    """Map the response's per-index embeddings into caller order.

    Items carry an explicit ``index``; if a provider omits it, fall back
    to positional order. Any missing/failed index becomes None so callers
    can count failures per chunk instead of losing the whole batch to one
    bad row.
    """
    vectors: list[list[float] | None] = [None] * expected
    positional = 0
    for item in data.get('data') or []:
        idx = item.get('index')
        emb = item.get('embedding')
        if not isinstance(idx, int):
            idx = positional
        positional += 1
        if 0 <= idx < expected and emb:
            vectors[idx] = emb
    return vectors


async def get_embeddings(
    texts: list[str],
    retry_delays: tuple[float, ...] = RETRY_DELAYS,
) -> list[list[float] | None]:
    """Embed a batch of texts in one API call. Order-preserving.

    Returns one vector per input (None where the API returned nothing for
    that index). Whole-batch failures (network/429 after retries) return
    all-None so callers log the chunks as failures and degrade to the
    keyword fallback path.

    ``retry_delays``: backoff schedule between attempts. Interactive
    callers (search query embedding) should pass a short schedule — a
    throttled account turns patient retries into TTFT.
    """
    base_url, api_key, model = _resolve_provider()
    if not get_settings().embedding_enabled:
        return [None] * len(texts)
    if not texts:
        return []
    if _provider_unusable(base_url, api_key):
        return [None] * len(texts)

    headers = {'Authorization': f'Bearer {api_key}'} if api_key else {}

    t0 = time.monotonic()
    last_exc: Exception | None = None
    for attempt in range(len(retry_delays) + 1):
        try:
            client = _get_http_client()
            resp = await client.post(
                f'{base_url}/embeddings',
                headers=headers,
                json=_request_payload(texts, model),
            )
            resp.raise_for_status()
            vectors = _parse_vectors(resp.json(), len(texts))
            latency_ms = (time.monotonic() - t0) * 1000
            ok = sum(1 for v in vectors if v is not None)
            logger.info(
                'Embedding batch success: model=%s base=%s batch=%d ok=%d dims=1024 latency=%.0fms',
                model, base_url, len(texts), ok, latency_ms,
            )
            if ok == 0:
                logger.warning(
                    'Embedding API returned unexpected shape: %s', str(resp.json())[:200],
                )
            return vectors
        except (ConnectionError, TimeoutError, KeyError, ValueError, httpx.HTTPError) as exc:
            # httpx.HTTPError covers HTTPStatusError (429 rate-limit / 5xx) so the
            # 3-tier RAG fallback (semantic -> keyword) degrades gracefully instead
            # of crashing the whole chat when GLM rate-limits the embeddings endpoint.
            last_exc = exc
            if attempt < len(retry_delays):
                delay = retry_delays[attempt]
                logger.debug('Embedding batch attempt %d failed, retrying in %.1fs: %s', attempt + 1, delay, exc)
                await asyncio.sleep(delay)
                continue
    latency_ms = (time.monotonic() - t0) * 1000
    logger.warning(
        'Embedding batch failed after %d attempts: model=embedding-3 batch=%d latency=%.0fms error=%s',
        len(retry_delays) + 1, len(texts), latency_ms, last_exc,
    )
    return [None] * len(texts)


async def _get_embedding(text: str) -> list[float] | None:
    """Get a single embedding vector (thin wrapper over the batch API)."""
    vectors = await get_embeddings([text])
    return vectors[0] if vectors else None
