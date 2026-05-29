"""Shared constants, logger, and small utilities for the RAG package."""

import hashlib
import logging
import re

import httpx

from app.config import get_settings

logger = logging.getLogger('read-pal.rag')

_CJK_TOKEN_RE = re.compile(r'[一-鿿]|[a-zA-Z0-9]+')

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
