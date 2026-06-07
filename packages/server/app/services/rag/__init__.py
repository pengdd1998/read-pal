"""RAG service package — retrieve relevant book content for AI chat enrichment.

Strategy tiers (auto-degrading):
  1. Semantic search via pgVector cosine similarity (pre-computed embeddings)
  2. Keyword matching fallback when embeddings unavailable
Results are cached in Redis per (book, query) for 30 minutes.
"""

# Public API
from app.services.rag.context import get_book_context
from app.services.rag.precompute import precompute_book_embeddings

# Chunking utilities (used by tests and other services)
from app.services.rag.chunking import _chunk_text, _split_long_paragraph

# Search strategies (used by tests)
from app.services.rag.search import (
    _keyword_chapter_search,
    _semantic_chapter_search,
)

# Embedding (used by tests)
from app.services.rag.embedding import _get_embedding

# Helpers (used by tests)
from app.services.rag._helpers import _get_chapters, _load_related_annotations

# Constants (used by tests)
from app.services.rag._constants import (
    RAG_CACHE_PREFIX,
    _CJK_TOKEN_RE,
    _get_http_client,
    _rag_cache_ttl,
    _stable_hash,
    _tokenize_query,
    logger,
)

__all__ = [
    # Public API
    'get_book_context',
    'precompute_book_embeddings',
    # Chunking
    '_chunk_text',
    '_split_long_paragraph',
    # Search
    '_keyword_chapter_search',
    '_semantic_chapter_search',
    '_tokenize_query',
    # Embedding
    '_get_embedding',
    # Helpers
    '_get_chapters',
    '_load_related_annotations',
    # Constants
    'RAG_CACHE_PREFIX',
    '_CJK_TOKEN_RE',
    '_get_http_client',
    '_rag_cache_ttl',
    '_stable_hash',
    'logger',
]
