"""Golden eval tests — CI-safe regression tests for the LLM harness.

These tests validate the infrastructure pipeline (sanitization, token budgeting,
schema validation, output filtering) against a golden dataset. No real API calls.
"""

from __future__ import annotations

import pytest

from app.eval.eval_runner import (
    run_sanitizer_regression,
    run_token_budget_regression,
    run_unit_eval,
)
from app.eval.golden_dataset import ALL_GOLDEN


class TestGoldenDataset:
    """Validate every golden case against the harness infrastructure."""

    @pytest.fixture(autouse=True)
    def _results(self):
        self.results = run_unit_eval()

    def test_all_golden_cases_pass(self):
        failures = [r for r in self.results if not r.passed]
        assert not failures, (
            f'{len(failures)} golden eval(s) failed:\n'
            + '\n'.join(
                f'  {r.service}/{r.action}: {"; ".join(r.errors)}'
                for r in failures
            )
        )

    def test_golden_count_matches_dataset(self):
        assert len(self.results) == len(ALL_GOLDEN), (
            f'Eval count mismatch: {len(self.results)} results vs {len(ALL_GOLDEN)} golden cases'
        )

    def test_injection_cases_detected(self):
        injection_results = [
            r for r in self.results if 'injection' in r.action
        ]
        assert len(injection_results) >= 2, (
            f'Expected >= 2 injection test cases, got {len(injection_results)}'
        )
        for r in injection_results:
            assert r.passed, f'Injection test failed: {r.service}/{r.action}: {r.errors}'


class TestTokenBudgetRegression:
    """Token estimation and budget accounting regression tests."""

    @pytest.fixture(autouse=True)
    def _results(self):
        self.results = run_token_budget_regression()

    def test_all_token_budget_tests_pass(self):
        failures = [r for r in self.results if not r.passed]
        assert not failures, (
            f'{len(failures)} token budget test(s) failed:\n'
            + '\n'.join(f'  {r.name}: {"; ".join(r.errors)}' for r in failures)
        )


class TestSanitizerRegression:
    """Sanitizer injection detection regression tests."""

    @pytest.fixture(autouse=True)
    def _results(self):
        self.results = run_sanitizer_regression()

    def test_all_sanitizer_tests_pass(self):
        failures = [r for r in self.results if not r.passed]
        assert not failures, (
            f'{len(failures)} sanitizer test(s) failed:\n'
            + '\n'.join(f'  {r.name}: {"; ".join(r.errors)}' for r in failures)
        )

    def test_benign_inputs_not_flagged(self):
        benign = [r for r in self.results if 'sanitizer/What' in r.name or 'sanitizer/Can' in r.name]
        for r in benign:
            assert r.passed, f'Benign input falsely flagged: {r.name}: {r.errors}'
