"""Reading companion agent — thin re-export layer.

All implementation lives in app.services.companion sub-package.
This module re-exports the public API for backward compatibility.
"""

from app.services.companion.context import (  # noqa: F401
    _load_annotations_context,
    _load_book,
    _load_history,
    _prepare_context,
    _save_message,
)
from app.services.companion.orchestrator import chat, summarize, explain  # noqa: F401
from app.services.companion.streaming import stream_chat  # noqa: F401
from app.services.companion.safety import quick_safety_check as _quick_safety_check  # noqa: F401
from app.services.companion.safety import persist_stream_log as _persist_stream_log  # noqa: F401
from app.services.llm import circuit, get_llm  # noqa: F401

__all__ = [
    'chat',
    'stream_chat',
    'summarize',
    'explain',
    '_load_book',
    '_load_history',
    '_load_annotations_context',
    '_save_message',
    '_prepare_context',
    '_quick_safety_check',
    '_persist_stream_log',
    'circuit',
    'get_llm',
]
