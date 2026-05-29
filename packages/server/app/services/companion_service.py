"""Reading companion agent — thin re-export layer.

All implementation lives in app.services.companion sub-package.
This module re-exports the public API for backward compatibility.
"""

from app.services.companion.context import (
    _load_annotations_context,
    _load_book,
    _load_history,
    _prepare_context,
    _save_message,
)
from app.services.companion.orchestrator import chat, summarize, explain
from app.services.companion.streaming import stream_chat
from app.services.companion.safety import quick_safety_check as _quick_safety_check
from app.services.companion.safety import persist_stream_log as _persist_stream_log
from app.services.llm import circuit, get_llm

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
