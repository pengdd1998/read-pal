"""Rule-based fast-path planner — deterministic plans for high-confidence
tool intents, zero LLM latency.

The LLM planner is deadline-bound (it runs BEFORE the answer's first
token) and on a bad provider day its latency is the whole budget: the
09-18 WT round measured glm 429 ladders burning 45s and mimo reasoning
runs at 15-42s. These rules cover the highest-frequency, unambiguous
intents instantly; everything else still goes to the LLM planner under
its deadline. High precision over recall — a wrong fast plan is worse
than a slow right one.
"""

from __future__ import annotations

import re
from typing import Any

# Each intent maps to a plan factory. Order matters only for documentation —
# patterns are mutually exclusive by construction.
_QUOTE_RE = re.compile(
    r'引用|原文|原句|原话|逐字|在哪一?页|哪一?段|出自|quote|exact (?:text|word|passage)|'
    r'verbatim|which page',
    re.IGNORECASE,
)
_CHAPTER_FULL_RE = re.compile(
    r'第\s*(\d{1,4})\s*[章回节].{0,8}(全文|整章|内容|所有|给我|发我|贴出)|'
    r'(给我|发我|贴出|看看?)第\s*(\d{1,4})\s*[章回节]|'
    r'(full text|entire chapter|whole chapter).*chapter\s*(\d{1,4})|'
    r'chapter\s*(\d{1,4})\s*(full text|in full|entirely)',
    re.IGNORECASE,
)
_PROGRESS_RE = re.compile(
    r'读到哪|读到哪里|进度|还剩多少|看了多少|百分之|多远|读完了吗|看完了?吗|'
    r'(how far|progress|how much (?:is )?left|percentage done|finished (?:it|the book))',
    re.IGNORECASE,
)
_ANNOTATIONS_RE = re.compile(
    r'我(标注|划|高亮|画)的|我的(标注|高亮|笔记|批注)|标过什么|划过什么|高亮了?哪些|'
    r'(标注|划|高亮|画)了(哪些|什么|的重点)|书上(标注|划|高亮)了?|'
    r'my (?:highlights?|notes?|annotations?|underlines?)|what did i (?:highlight|mark|note)',
    re.IGNORECASE,
)
_FLASHCARDS_RE = re.compile(
    r'闪卡|复习卡|抽认卡|待复习的卡|flashcards?|review cards?|cards due',
    re.IGNORECASE,
)
_GRAPH_RE = re.compile(
    r'知识图谱|概念图|概念之间|关联图|knowledge graph|concept (?:web|map|graph)',
    re.IGNORECASE,
)
_MEMORY_RE = re.compile(
    r'阅读镜像|镜像报告|读后总结册|memory book|reading mirror',
    re.IGNORECASE,
)


def _plan(name: str, args: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return [{'name': name, 'args': args or {}}]


def _search_plan(message: str) -> list[dict[str, Any]]:
    from app.services.companion.query_classifier import refine_rag_query

    query = (refine_rag_query(message, []) or message).strip()[:200]
    if len(query) < 2:
        query = message.strip()[:200]
    return _plan('search_book', {'query': query, 'scope': 'current'})


def rule_plan(message: str) -> list[dict[str, Any]] | None:
    """Deterministic plan for unambiguous intents; None = no rule matched.

    Returning an EMPTY list is a valid outcome ("definitely no tools");
    None means "no high-confidence rule — ask the LLM planner".
    """
    text = message.strip()
    if not text:
        return None

    if _FLASHCARDS_RE.search(text):
        return _plan('get_flashcards')
    if _GRAPH_RE.search(text):
        return _plan('get_knowledge_graph')
    if _MEMORY_RE.search(text):
        return _plan('get_memory_book')
    if _ANNOTATIONS_RE.search(text):
        return _plan('get_annotations')
    if _PROGRESS_RE.search(text):
        return _plan('get_reading_progress')

    full = _CHAPTER_FULL_RE.search(text)
    if full:
        for group in full.groups():
            if group and group.isdigit():
                return _plan('get_chapter', {'index': int(group)})

    if _QUOTE_RE.search(text):
        return _search_plan(text)

    return None
