"""Crisis-detection gate + embedding batch parsing regression tests.

Crisis gate (BND-R03/R04 hardening, 2026-09-02): the companion must
answer first-person crisis signals with the fixed caring template instead
of an LLM answer — while NEVER hijacking normal book discussion that
mentions death/violence (novels are full of it).
"""

from app.services.companion.safety import (
    _CRISIS_PHRASES,
    crisis_response,
    detect_crisis,
)
from app.services.rag.embedding import _parse_vectors


class TestDetectCrisis:
    def test_first_person_zh_signals_hit(self):
        for msg in (
            '我不想活了',
            '我最近不想活了',
            '真的不想活了',
            '我最近想死',
            '有什么自杀的方法吗',
            '我一直在自残',
            '我活不下去了',
        ):
            assert detect_crisis(msg), msg

    def test_first_person_en_signals_hit(self):
        for msg in (
            'I want to die',
            'I am going to kill myself',
            'sometimes I hurt myself',
            'there is no reason to live',
        ):
            assert detect_crisis(msg), msg

    def test_book_discussion_never_hits(self):
        # Death/violence vocabulary ABOUT THE BOOK must stay with the LLM.
        for msg in (
            '这章里谁被杀了？',
            '主角最后死了吗？',
            '作者为什么要写自杀这个情节？',
            'Who killed Gatsby in the end?',
            '这一章讲的是战争的残酷',
            'kill 移动平均线是什么',  # finance jargon collision
        ):
            assert not detect_crisis(msg), msg

    def test_empty_and_none(self):
        assert not detect_crisis('')
        assert not detect_crisis(None)

    def test_phrases_lowercase_match(self):
        assert detect_crisis('I Want To Die') is True


class TestCrisisResponse:
    def test_zh_and_en_templates_exist(self):
        assert '400-161-9995' in crisis_response('zh')
        assert '988' in crisis_response('en')

    def test_unknown_lang_falls_back_to_en(self):
        assert crisis_response('fr') == crisis_response('en')


class TestParseVectors:
    def test_indexed_items_map_by_index(self):
        vectors = _parse_vectors(
            {'data': [
                {'index': 1, 'embedding': [2.0]},
                {'index': 0, 'embedding': [1.0]},
            ]},
            expected=3,
        )
        assert vectors == [[1.0], [2.0], None]

    def test_positional_fallback_when_index_missing(self):
        # Some OpenAI-compatible providers omit `index`; preserve order.
        vectors = _parse_vectors(
            {'data': [{'embedding': [1.0]}, {'embedding': [2.0]}]},
            expected=2,
        )
        assert vectors == [[1.0], [2.0]]

    def test_missing_rows_become_none(self):
        vectors = _parse_vectors({'data': [{'index': 0, 'embedding': [1.0]}]}, expected=2)
        assert vectors == [[1.0], None]

    def test_empty_data_all_none(self):
        assert _parse_vectors({'data': []}, expected=2) == [None, None]


class TestCrisisPhraseHygiene:
    def test_no_broad_vocabulary(self):
        # Guard against someone "helpfully" adding 死/kill/suicide as bare
        # words — they false-positive on normal book discussion.
        for banned in ('死', 'kill', 'suicide', '消失', '死了吗'):
            assert banned not in _CRISIS_PHRASES, banned
