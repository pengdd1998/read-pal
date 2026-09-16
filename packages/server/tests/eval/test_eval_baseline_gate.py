"""Tests for the engineering-upgrade B3 eval additions:

- run_all() regression gate wiring (baseline REGRESSION blocks the run)
- equals / regex assertions in validate_output_shape
- guards annotation coverage on ALL_GOLDEN
- L2 judge module (rubric rendering, scoring, graceful degradation)
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

from app.eval.assertions import EvalResult, validate_output_shape
from app.eval.golden_dataset import ALL_GOLDEN


# ---------------------------------------------------------------------------
# Baseline gate wiring
# ---------------------------------------------------------------------------


def _write_baseline(tmp_path, entries):
    path = tmp_path / 'baseline.json'
    path.write_text(json.dumps({'metadata': {}, 'entries': entries}), encoding='utf-8')
    return path


class TestBaselineGateWiring:
    def test_regression_blocks_run_all(self, tmp_path, monkeypatch):
        """A result that passed at baseline time but fails now → run_all False."""
        from app.eval import eval_runner
        from app.eval import regression_baseline as rb

        baseline = _write_baseline(tmp_path, [{
            'name': 'token_estimation/latin', 'service': 'token_budget',
            'action': 'latin', 'passed': True, 'errors': [],
        }])
        monkeypatch.setattr(rb, 'DEFAULT_BASELINE_PATH', baseline)

        failing = EvalResult('token_estimation/latin', 'token_budget', 'latin')
        failing.fail('simulated break')
        monkeypatch.setattr(
            eval_runner, 'run_token_budget_regression', lambda: [failing])
        monkeypatch.setattr(eval_runner, 'run_sanitizer_regression', lambda: [])

        assert eval_runner.run_all() is False

    def test_clean_run_passes_with_baseline(self, tmp_path, monkeypatch):
        """Same result, still passing → run_all True (no regression)."""
        from app.eval import eval_runner
        from app.eval import regression_baseline as rb

        baseline = _write_baseline(tmp_path, [{
            'name': 'token_estimation/latin', 'service': 'token_budget',
            'action': 'latin', 'passed': True, 'errors': [],
        }])
        monkeypatch.setattr(rb, 'DEFAULT_BASELINE_PATH', baseline)

        passing = EvalResult('token_estimation/latin', 'token_budget', 'latin')
        monkeypatch.setattr(
            eval_runner, 'run_token_budget_regression', lambda: [passing])
        monkeypatch.setattr(eval_runner, 'run_sanitizer_regression', lambda: [])

        assert eval_runner.run_all() is True

    def test_new_entry_without_baseline_does_not_block(self, tmp_path, monkeypatch):
        """NEW (not in baseline) is informational, not a regression."""
        from app.eval import eval_runner
        from app.eval import regression_baseline as rb

        monkeypatch.setattr(rb, 'DEFAULT_BASELINE_PATH', _write_baseline(tmp_path, []))

        passing = EvalResult('brand/new', 'brand', 'new')
        monkeypatch.setattr(
            eval_runner, 'run_token_budget_regression', lambda: [passing])
        monkeypatch.setattr(eval_runner, 'run_sanitizer_regression', lambda: [])

        assert eval_runner.run_all() is True


# ---------------------------------------------------------------------------
# equals / regex assertions
# ---------------------------------------------------------------------------


class TestExactAndRegexAssertions:
    def _check(self, output, expected):
        result = EvalResult('t', 't', 't')
        validate_output_shape(output, expected, result)
        return result

    def test_equals_pass_and_fail(self):
        assert self._check('exact text', {'type': 'str', 'equals': 'exact text'}).passed
        result = self._check('exact text ', {'type': 'str', 'equals': 'exact text'})
        assert not result.passed
        assert any('exact' in e for e in result.errors)

    def test_regex_pass_and_fail(self):
        ok = self._check(
            'Reading plan for "1984" (7 days)',
            {'type': 'str', 'regex': [r'"[^"]+"\s\(\d+ days\)']},
        )
        assert ok.passed
        bad = self._check(
            'Reading plan for 1984, seven days',
            {'type': 'str', 'regex': [r'"[^"]+"\s\(\d+ days\)']},
        )
        assert not bad.passed
        assert any('pattern' in e for e in bad.errors)


# ---------------------------------------------------------------------------
# Guards annotation coverage
# ---------------------------------------------------------------------------


class TestGuardsAnnotation:
    def test_every_golden_entry_declares_guards(self):
        missing = [
            f"{g['service']}/{g['action']}"
            for g in ALL_GOLDEN
            if not g.get('guards')
        ]
        assert not missing, f'Golden entries without guards annotation: {missing}'

    def test_guards_vocabulary_is_closed(self):
        allowed = {'format', 'schema', 'injection', 'sanitizer', 'budget'}
        for g in ALL_GOLDEN:
            for token in g['guards'].split('+'):
                assert token in allowed, (
                    f"{g['service']}/{g['action']} uses unknown guard token {token!r}"
                )


# ---------------------------------------------------------------------------
# L2 judge
# ---------------------------------------------------------------------------


class TestJudgeModule:
    def test_rubric_is_versioned_and_declares_variables(self):
        from app.eval.judges import JUDGE_RUBRIC

        assert JUDGE_RUBRIC.version >= 1
        assert set(JUDGE_RUBRIC.variables) == {'task', 'expectation', 'output'}
        rendered = JUDGE_RUBRIC.template.format(
            task='T', expectation='E', output='O')
        assert '{{' not in rendered  # no unreplaced placeholders leak
        assert 'Anti-sycophancy' in rendered  # anti-sycophancy clause present
        assert 'Score anchors' in rendered

    def test_judge_output_parses_valid_score(self):
        from app.eval.judges import judge_output

        with patch(
            'app.eval.judges.safe_llm_invoke',
            new_callable=AsyncMock,
            return_value={'score': 4, 'rationale': 'all met', 'issues': []},
        ) as mock_invoke:
            score = _run(judge_output(task='t', expectation='e', output='o'))
        assert score is not None and score.score == 4
        # The rendered prompt reached the LLM as a single human message.
        rendered = mock_invoke.call_args.args[0][0].content
        assert 'Task:\nt' in rendered and 'Output to judge:\no' in rendered

    def test_judge_output_degrades_to_none_on_llm_failure(self):
        from app.eval.judges import judge_output

        with patch(
            'app.eval.judges.safe_llm_invoke',
            new_callable=AsyncMock, return_value=None,
        ):
            assert _run(judge_output(task='t', expectation='e', output='o')) is None

    def test_judge_output_rejects_out_of_range_score(self):
        from app.eval.judges import judge_output

        with patch(
            'app.eval.judges.safe_llm_invoke',
            new_callable=AsyncMock,
            return_value={'score': 9, 'rationale': 'sycophantic', 'issues': []},
        ):
            # schema violation → validated to None, not a 9
            assert _run(judge_output(task='t', expectation='e', output='o')) is None

    def test_score_live_reports_skips_unscorable(self):
        from app.eval.judges import score_live_reports

        class _Report:
            def __init__(self, name, output_text='', skipped=False):
                self.name = name
                self.output_text = output_text
                self.skipped = skipped
                self.passed = True

        reports = [
            _Report('companion/chat'),                       # real golden, has output
            _Report('companion/chat'),                       # no output → UNSCORED
            _Report('does/not-exist', output_text='x'),      # not in registry → UNSCORED
            _Report('companion/chat', skipped=True),         # skipped entirely
        ]
        reports[0].output_text = 'Some answer about the theme.'
        with patch(
            'app.eval.judges.safe_llm_invoke',
            new_callable=AsyncMock,
            return_value={'score': 3, 'rationale': 'partial', 'issues': ['vague']},
        ):
            scored = _run(score_live_reports(reports))
        assert len(scored) == 3  # skipped one not scored
        assert scored[0][1] is not None and scored[0][1].score == 3
        assert scored[1][1] is None
        assert scored[2][1] is None


def _run(coro):
    import asyncio
    return asyncio.run(coro)
