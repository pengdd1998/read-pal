"""Shared constants, logger, and small utilities for the RAG package."""

import hashlib
import logging
import re

import httpx

from app.config import get_settings

logger = logging.getLogger('read-pal.rag')

_CJK_TOKEN_RE = re.compile(r'[一-鿿]|[a-zA-Z0-9]+')


def _tokenize_with_bigrams(query: str) -> set[str]:
    """Tokenize query: English words + CJK bigrams for precision."""
    tokens: set[str] = set()
    cjk_chars: list[str] = []
    buf = ''
    for ch in query.lower():
        if '一' <= ch <= '鿿':
            if buf:
                tokens.add(buf)
                buf = ''
            cjk_chars.append(ch)
        elif ch.isalnum():
            buf += ch
        else:
            if buf:
                tokens.add(buf)
                buf = ''
    if buf:
        tokens.add(buf)
    # Bigrams from consecutive CJK characters
    for i in range(len(cjk_chars) - 1):
        tokens.add(cjk_chars[i] + cjk_chars[i + 1])
    # Also keep single CJK chars for short queries
    tokens.update(cjk_chars)
    return tokens


# Backward-compatible alias
def _tokenize_query(query: str) -> set[str]:
    return _tokenize_with_bigrams(query)

RAG_CACHE_PREFIX = 'rag:'


def _rag_cache_ttl() -> int:
    return get_settings().cache_rag_ttl_seconds


_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=10)
    return _http_client


def _stable_hash(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:16]
