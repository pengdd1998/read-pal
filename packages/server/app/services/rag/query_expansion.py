"""LLM-powered RAG query expansion (P0-2, 2026-09-25).

Users ask vague thematic questions ("那段描写夜晚孤独感的文字在哪里？")
whose vocabulary differs drastically from the book's prose. This module
calls a fast LLM to expand the query into retrieval-friendly keywords,
caches the result, and falls back to the raw query on any failure.
"""

from __future__ import annotations

import hashlib

from langchain_core.messages import HumanMessage

from app.services.llm.safe_invoke import safe_llm_call
from app.services.rag._constants import logger

QUERY_EXPANSION_PROMPT = (
    'Extract 5-10 search keywords from this question about a book. '
    'Return ONLY the keywords separated by spaces, no explanation.\n'
    'Question: {query}'
)

_CACHE_TTL = 600  # 10 min — conversations repeat queries


async def expand_rag_query(query: str) -> str:
    """Expand a vague query into retrieval keywords; cache + graceful fallback.

    Returns the expanded keywords on success, or the original query on
    any failure (LLM unavailable, timeout, empty response). The caller
    passes the result directly to the retrieval pipeline.
    """
    from app.core.cache import cache_get, cache_set

    key = f'rag:qexp:{hashlib.sha256(query.encode()).hexdigest()[:24]}'
    cached = await cache_get(key)
    if isinstance(cached, str) and cached:
        return cached

    try:
        prompt = QUERY_EXPANSION_PROMPT.format(query=query)
        expanded = await safe_llm_call(
            [HumanMessage(content=prompt)],
            log_label='rag.query_expansion',
            use_cache=False,  # Redis cache below suffices; avoid double-cache
            cache_anon=False,
            max_tokens=100,  # keywords only, no long response
        )
        expanded = (expanded or '').strip()
        if not expanded or len(expanded) < 3:
            return query
        await cache_set(key, expanded, ttl=_CACHE_TTL)
        return expanded
    except Exception:  # noqa: BLE001 — expansion is best-effort
        logger.debug('rag.query_expansion_failed — using raw query')
        return query
