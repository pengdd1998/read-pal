"""Reading companion agent — AI chat, summarization, explanation, and tools."""

from app.services.companion.context import (
    _load_annotations_context,
    _load_book,
    _load_history,
    _prepare_context,
    _save_message,
)
from app.services.companion.orchestrator import chat, summarize, explain
from app.services.companion.streaming import stream_chat

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
]
