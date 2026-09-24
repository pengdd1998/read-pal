"""Cross-encoder rerank via a hosted /rerank endpoint (P2, 2026-09-24).

Probe evidence that motivated this module: the gold chapter is present
in the pool-50 fused candidate list for 100% of paraphrase eval queries —
recall is intact, only top-k truncation loses it. A cross-encoder scoring
(query, passage) pairs directly is the strongest available lever for
promoting the right passage out of that pool.

Contract: ``rerank_passages(query, passages)`` returns a list of
relevance scores aligned with the input order, or ``None`` on ANY
failure (disabled / unconfigured / HTTP error / malformed response) —
callers keep their prior ordering. The module never raises into the
search path.
"""

from __future__ import annotations

import httpx

from app.services.rag._constants import _get_http_client, logger

# Cap on passages sent per call — bounds latency and cost. The chapter
# aggregation (P1) already front-loads strong candidates, so the reranker
# sees the most promising slice of the pool, not raw chaff.
CANDIDATE_CAP = 30
# Passage slice per pair — rerankers trim internally, and the eval corpus
# chunks at ~1.6k chars; generous headroom without sending whole chapters.
_MAX_PASSAGE_CHARS = 2000
_TIMEOUT_S = 5.0


async def rerank_passages(query: str, passages: list[str]) -> list[float] | None:
    """Score passages against the query; None on any failure."""
    from app.config import get_settings

    settings = get_settings()
    if not settings.rerank_api_key:
        return None

    docs = [(p or '')[:_MAX_PASSAGE_CHARS] for p in passages]
    try:
        client: httpx.AsyncClient = _get_http_client()
        resp = await client.post(
            f'{settings.rerank_base_url.rstrip("/")}/rerank',
            headers={'Authorization': f'Bearer {settings.rerank_api_key}'},
            json={
                'model': settings.rerank_model,
                'query': query,
                'documents': docs,
                'top_n': len(docs),
                'return_documents': False,
            },
            timeout=_TIMEOUT_S,
        )
        resp.raise_for_status()
        results = resp.json().get('results') or []
        scores = [0.0] * len(docs)
        for item in results:
            idx = item.get('index')
            score = item.get('relevance_score')
            if isinstance(idx, int) and 0 <= idx < len(docs) and isinstance(score, (int, float)):
                scores[idx] = float(score)
        return scores
    except (ValueError, KeyError, TypeError, RuntimeError, httpx.HTTPError) as exc:
        logger.warning('rag.rerank_failed error=%s', str(exc)[:160])
        return None
