"""Core-loop canary — the grounding check (``ops/observability/core_loop_canary.py``).

The canary is stdlib-only and runs on a bare CI runner, so it is loaded from
its path instead of being imported as a package. These tests pin what counts
as a grounded answer: on 2026-11-28 the litter question expected ``玻璃纸``
alone and failed a correct answer (``垃圾`` — the preface's own word).
"""

import importlib.util
from pathlib import Path

import pytest

_CANARY = Path(__file__).resolve().parents[4] / 'ops' / 'observability' / 'core_loop_canary.py'


def _load():
    spec = importlib.util.spec_from_file_location('core_loop_canary', _CANARY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestGrounding:
    def test_every_question_lists_the_facts_that_count(self):
        canary = _load()
        assert len(canary.QUESTIONS) >= 4
        for question, accepted in canary.QUESTIONS:
            assert question.strip()
            assert accepted and all(token.strip() for token in accepted), question

    @pytest.mark.parametrize('answer', [
        '她把外星人留下的东西比作**“垃圾”**。',  # the preface's own comparison
        '比作野餐后留下的皱巴巴的玻璃纸和啤酒罐。',  # …and its concrete examples
    ])
    def test_each_correct_answer_to_the_litter_question_counts(self, answer):
        canary = _load()
        question, accepted = canary.QUESTIONS[2]
        assert question == '勒古恩把外星人留下的东西比作什么？'
        assert canary.grounded(answer, accepted)

    def test_an_answer_without_any_fact_does_not_count(self):
        canary = _load()
        _, accepted = canary.QUESTIONS[2]
        assert not canary.grounded('这让我想起一句很妙的比喻。', accepted)
        assert not canary.grounded('', accepted)

    def test_the_summary_lists_every_accepted_fact(self, monkeypatch):
        """The JSON line is what the alert and the log are read from."""
        canary = _load()
        monkeypatch.setattr(canary, 'login', lambda: 'tok')
        monkeypatch.setattr(canary, 'companion_turn', lambda *_a, **_k: {
            'status': 200, 't_frame': 0.1, 't_first_token': 0.2, 't_total': 0.3,
            'text': '勒古恩把他们丢下的东西比作垃圾。', 'done': True,
        })
        monkeypatch.setenv('CANARY_QUESTION_INDEX', '2')
        ok, failures, turn = canary.run()
        assert ok, failures
        assert turn['expected'] == ['垃圾', '玻璃纸', '啤酒罐']
