"""Tool capability for the companion — JSON-protocol, plan-then-answer.

v1 (7 read-only tools) per the 2026-09-14 implementation plan. The tool
phase sits BETWEEN context preparation and the streaming answer: a fast
non-streaming planning call decides which (if any) tools to run, results
are injected as an untrusted-data section, and the existing streaming
pipeline answers with them. Every failure degrades silently to the
no-tools path — worst case equals today's behavior.
"""

from app.services.companion.tools.implementations import (
    get_annotations,
    get_chapter,
    get_flashcards,
    get_knowledge_graph,
    get_memory_book,
    get_reading_progress,
    search_book,
)
from app.services.companion.tools.planner import plan_tool_calls
from app.services.companion.tools.protocol import parse_tool_plan
from app.services.companion.tools.registry import (
    MAX_TOOLS_PER_TURN,
    TOOL_SPECS,
    execute_tool,
    render_tool_results,
)

__all__ = [
    'MAX_TOOLS_PER_TURN',
    'TOOL_SPECS',
    'execute_tool',
    'render_tool_results',
    'parse_tool_plan',
    'plan_tool_calls',
    'get_annotations',
    'get_chapter',
    'get_flashcards',
    'get_knowledge_graph',
    'get_memory_book',
    'get_reading_progress',
    'search_book',
]
