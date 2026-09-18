"""Rule-based fast-path planner + get_chapter spoiler guard (K5/TL4-02, 09-18).

The rule path exists because the LLM planner is deadline-bound and
provider-latency-bound; these tests pin the contract: high-confidence
intents plan deterministically, ambiguous ones fall through (None), and
the chapter-withheld decision can never hand out unread chapters.
"""

from __future__ import annotations

import pytest

from app.services.companion.tools.implementations import _chapter_withheld
from app.services.companion.tools.rule_plan import rule_plan


class TestRulePlanIntents:
    @pytest.mark.parametrize('msg,tool', [
        ('这本书我读到哪了？', 'get_reading_progress'),
        ('我还剩多少没读', 'get_reading_progress'),
        ('how far along am I?', 'get_reading_progress'),
        ('我的高亮有哪些？', 'get_annotations'),
        ('我标过什么内容', 'get_annotations'),
        ('what did I highlight in this book?', 'get_annotations'),
        ('帮我看看待复习的卡片', 'get_flashcards'),
        ('show me my flashcards', 'get_flashcards'),
        ('知识图谱里都有什么概念？', 'get_knowledge_graph'),
        ('我的阅读镜像生成了吗', 'get_memory_book'),
    ])
    def test_direct_tool_intents(self, msg, tool):
        plan = rule_plan(msg)
        assert plan is not None
        assert [c['name'] for c in plan] == [tool]

    @pytest.mark.parametrize('msg', [
        '引用一下他说这句话的原文',
        '给我第4章全文',
        'show me the exact text of his vow',
    ])
    def test_content_intents_plan_tools(self, msg):
        plan = rule_plan(msg)
        assert plan is not None, msg
        assert plan[0]['name'] in ('search_book', 'get_chapter')

    def test_chapter_full_text_extracts_index(self):
        plan = rule_plan('给我第4章全文')
        assert plan == [{'name': 'get_chapter', 'args': {'index': 4}}]

    def test_search_plan_carries_query(self):
        plan = rule_plan('引用一下主角改变的原文')
        assert plan[0]['name'] == 'search_book'
        assert len(plan[0]['args']['query']) >= 2

    @pytest.mark.parametrize('msg', [
        '主角为什么改变主意？',      # ambiguous content — LLM planner's job
        '你觉得这一章写得怎么样',
        '谢谢！',
        '',
        '继续',
    ])
    def test_ambiguous_falls_through(self, msg):
        assert rule_plan(msg) is None


class TestChapterWithheld:
    """Pure decision surface for the TL4-02 spoiler guard.

    Semantics mirror the RAG spoiler limit (rag/context.py, P7.4):
    ``current_page`` is the 0-based chapter index the reader is on; a
    1-based chapter index strictly beyond it is unread.
    """

    def test_unread_chapter_withheld(self):
        # reader on chapter index 2; asking for chapter 5 (0-based 4)
        assert _chapter_withheld(5, current_page=2, is_completed=False) is True

    def test_current_chapter_served(self):
        # chapter index 2 == on-page chapter (1-based 3)
        assert _chapter_withheld(3, current_page=2, is_completed=False) is False

    def test_earlier_chapter_served(self):
        assert _chapter_withheld(1, current_page=2, is_completed=False) is False

    def test_segment_style_values_do_not_leak(self):
        # The P7.4 bug class: a segment-style value (small, resets) used to
        # pass for a chapter index — with current_page=4 from segments the
        # reader may be nowhere near chapter 5; only the real chapter index
        # feeds this function, and the assertion documents the boundary.
        assert _chapter_withheld(6, current_page=4, is_completed=False) is True
        assert _chapter_withheld(5, current_page=4, is_completed=False) is False

    def test_completed_book_unfiltered(self):
        assert _chapter_withheld(99, current_page=0, is_completed=True) is False
