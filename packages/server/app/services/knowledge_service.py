"""Re-export shim for backward compatibility.

All implementation has been moved to ``app.services.knowledge`` package.
This file re-exports every public and internal symbol so that existing
``from app.services.knowledge_service import X`` statements continue to work.
"""

from app.services.knowledge import (  # noqa: F401
    GRAPH_KEY_PREFIX,
    _content_hash,
    _knowledge_cache_ttl,
    _load_annotations,
    _load_cached_graph,
    build_graph,
    detect_gaps,
    get_concepts,
    get_cross_book_themes,
    search_concepts,
)
