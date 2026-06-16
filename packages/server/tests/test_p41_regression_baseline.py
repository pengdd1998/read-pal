"""P4.1 tests: regression baseline — eval replay + regression detection.

Validates the workflow:
- Missing baseline → everything is NEW (no crash on first run)
- Same pass/fail shape → no regressions, no improvements
- Previously-passing → now-failing → REGRESSION (blocks merge)
- Previously-failing → now-passing → IMPROVEMENT (informational)
- Brand-new test (not in baseline) → NEW
- update_baseline round-trips: write then load returns equivalent state

The classifier is the load-bearing piece — getting it wrong silently
either blocks merges unnecessarily (false regressions) or lets bad
changes through (missed regressions). Both are expensive; pin them down.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.eval.assertions import EvalResult
from app.eval.regression_baseline import (
    DEFAULT_BASELINE_PATH,
    BaselineEntry,
    RegressionReport,
    _entry_key,
    compare_to_baseline,
    load_baseline,
    results_to_entries,
    update_baseline,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_result(
    name: str, service: str, action: str,
    passed: bool, errors: list[str] | None = None,
) -> EvalResult:
    """Build an EvalResult in a given pass/fail state."""
    r = EvalResult(name=name, service=service, action=action)
    if not passed:
        r.passed = False
        r.errors = errors or ['synthetic failure']
    return r


# ---------------------------------------------------------------------------
# load_baseline
# ---------------------------------------------------------------------------


def test_load_baseline_returns_empty_when_file_missing(tmp_path: Path):
    """Missing baseline → empty dict. First-run case."""
    missing = tmp_path / 'nope.json'
    assert load_baseline(missing) == {}


def test_load_baseline_returns_empty_when_corrupt(tmp_path: Path):
    """Garbage JSON → empty dict, NOT an exception. Comparator treats all as NEW."""
    bad = tmp_path / 'bad.json'
    bad.write_text('not json {{{', encoding='utf-8')
    assert load_baseline(bad) == {}


def test_load_baseline_returns_empty_when_wrong_shape(tmp_path: Path):
    """Valid JSON but missing 'entries' key → empty dict (defensive)."""
    weird = tmp_path / 'weird.json'
    weird.write_text(json.dumps({'foo': 'bar'}), encoding='utf-8')
    assert load_baseline(weird) == {}


def test_load_baseline_round_trips_after_update(tmp_path: Path):
    """update_baseline then load_baseline gives back the same entries."""
    results = [
        _make_result('test_a', 'companion', 'chat', passed=True),
        _make_result('test_b', 'memory_book', 'generate', passed=False, errors=['boom']),
    ]
    path = tmp_path / 'baseline.json'
    update_baseline(results, path=path)

    loaded = load_baseline(path)
    assert len(loaded) == 2
    key_a = _entry_key('test_a', 'companion', 'chat')
    key_b = _entry_key('test_b', 'memory_book', 'generate')
    assert key_a in loaded
    assert key_b in loaded
    assert loaded[key_a].passed is True
    assert loaded[key_b].passed is False
    assert loaded[key_b].errors == ['boom']


def test_load_baseline_skips_malformed_entries(tmp_path: Path):
    """One corrupted entry doesn't poison the rest."""
    path = tmp_path / 'mixed.json'
    path.write_text(json.dumps({
        'entries': [
            {'name': 'good', 'service': 's', 'action': 'a', 'passed': True},
            {'name': 'bad', 'service': 's'},  # missing 'action'
            {'name': 'also_good', 'service': 's', 'action': 'a2', 'passed': False},
        ],
    }), encoding='utf-8')

    loaded = load_baseline(path)
    assert len(loaded) == 2  # good + also_good, bad skipped


# ---------------------------------------------------------------------------
# compare_to_baseline — classification logic
# ---------------------------------------------------------------------------


def test_compare_classifies_passed_passed_as_passed():
    """Was passing, still passing → passed."""
    results = [_make_result('t1', 's', 'a', passed=True)]
    baseline = {
        _entry_key('t1', 's', 'a'): BaselineEntry('t1', 's', 'a', passed=True),
    }
    report = compare_to_baseline(results, baseline=baseline)
    assert report.passed == [_entry_key('t1', 's', 'a')]
    assert not report.regressions
    assert not report.improvements
    assert not report.new_tests


def test_compare_classifies_failed_failed_as_failed():
    """Was failing, still failing → failed (NOT a regression)."""
    results = [_make_result('t1', 's', 'a', passed=False)]
    baseline = {
        _entry_key('t1', 's', 'a'): BaselineEntry('t1', 's', 'a', passed=False),
    }
    report = compare_to_baseline(results, baseline=baseline)
    assert report.failed == [_entry_key('t1', 's', 'a')]
    assert not report.regressions


def test_compare_classifies_pass_to_fail_as_regression():
    """Was passing, now failing → REGRESSION. The merge-blocking case."""
    results = [_make_result('t1', 's', 'a', passed=False)]
    baseline = {
        _entry_key('t1', 's', 'a'): BaselineEntry('t1', 's', 'a', passed=True),
    }
    report = compare_to_baseline(results, baseline=baseline)
    assert report.regressions == [_entry_key('t1', 's', 'a')]
    assert report.has_regressions


def test_compare_classifies_fail_to_pass_as_improvement():
    """Was failing, now passing → IMPROVEMENT. Informational, not blocking."""
    results = [_make_result('t1', 's', 'a', passed=True)]
    baseline = {
        _entry_key('t1', 's', 'a'): BaselineEntry('t1', 's', 'a', passed=False),
    }
    report = compare_to_baseline(results, baseline=baseline)
    assert report.improvements == [_entry_key('t1', 's', 'a')]
    assert not report.has_regressions


def test_compare_classifies_no_baseline_entry_as_new():
    """Test not in baseline → NEW."""
    results = [_make_result('t1', 's', 'a', passed=True)]
    report = compare_to_baseline(results, baseline={})
    assert report.new_tests == [_entry_key('t1', 's', 'a')]
    assert not report.regressions


def test_compare_handles_mixed_classifications():
    """One of each category — make sure they don't bleed into each other."""
    results = [
        _make_result('pp', 's', 'a', passed=True),    # pass→pass
        _make_result('ff', 's', 'a', passed=False),   # fail→fail
        _make_result('pf', 's', 'a', passed=False),   # pass→fail (REGRESSION)
        _make_result('fp', 's', 'a', passed=True),    # fail→pass (IMPROVEMENT)
        _make_result('new', 's', 'a', passed=True),   # not in baseline
    ]
    baseline = {
        _entry_key('pp', 's', 'a'): BaselineEntry('pp', 's', 'a', passed=True),
        _entry_key('ff', 's', 'a'): BaselineEntry('ff', 's', 'a', passed=False),
        _entry_key('pf', 's', 'a'): BaselineEntry('pf', 's', 'a', passed=True),
        _entry_key('fp', 's', 'a'): BaselineEntry('fp', 's', 'a', passed=False),
    }
    report = compare_to_baseline(results, baseline=baseline)
    assert len(report.passed) == 1
    assert len(report.failed) == 1
    assert len(report.regressions) == 1
    assert len(report.improvements) == 1
    assert len(report.new_tests) == 1


# ---------------------------------------------------------------------------
# RegressionReport.summary
# ---------------------------------------------------------------------------


def test_summary_lists_regression_names_when_present():
    """Summary should name failing tests so a CI log is actionable."""
    results = [_make_result('regressing_test', 's', 'a', passed=False)]
    baseline = {
        _entry_key('regressing_test', 's', 'a'): BaselineEntry(
            'regressing_test', 's', 'a', passed=True,
        ),
    }
    report = compare_to_baseline(results, baseline=baseline)
    summary = report.summary()
    assert 'regressing_test' in summary
    assert 'REGRESSION' in summary.upper() or 'regression' in summary


def test_summary_does_not_list_names_when_clean():
    """A clean run (no regressions) summary should be short and quiet."""
    results = [_make_result('ok', 's', 'a', passed=True)]
    baseline = {
        _entry_key('ok', 's', 'a'): BaselineEntry('ok', 's', 'a', passed=True),
    }
    report = compare_to_baseline(results, baseline=baseline)
    summary = report.summary()
    assert 'regressing_test' not in summary
    assert 'Regressions:' not in summary


# ---------------------------------------------------------------------------
# update_baseline — file format
# ---------------------------------------------------------------------------


def test_update_baseline_writes_indented_sorted_json(tmp_path: Path):
    """Baseline JSON is indented + sorted for stable diffs in code review."""
    path = tmp_path / 'baseline.json'
    results = [
        _make_result('z_last', 's', 'a', passed=True),
        _make_result('a_first', 's', 'a', passed=True),
    ]
    update_baseline(results, path=path)

    text = path.read_text(encoding='utf-8')
    # sort_keys=True puts 'a_first' before 'z_last' in the entries list.
    assert text.index('a_first') < text.index('z_last')
    # Indented output (not single-line).
    assert '\n  ' in text


def test_update_baseline_preserves_errors_for_failed_results(tmp_path: Path):
    """Failed result errors are stored so reviewers see WHY it failed."""
    path = tmp_path / 'baseline.json'
    results = [
        _make_result('failing', 's', 'a', passed=False, errors=['first error', 'second error']),
    ]
    update_baseline(results, path=path)

    raw = json.loads(path.read_text(encoding='utf-8'))
    assert raw['entries'][0]['errors'] == ['first error', 'second error']


def test_update_baseline_accepts_metadata(tmp_path: Path):
    """Optional metadata block for git SHA / prompt_version tracking."""
    path = tmp_path / 'baseline.json'
    results = [_make_result('t', 's', 'a', passed=True)]
    update_baseline(
        results, path=path,
        metadata={'git_sha': 'abc123', 'prompt_version': 7, 'model': 'glm-4.7-flash'},
    )
    raw = json.loads(path.read_text(encoding='utf-8'))
    assert raw['metadata']['git_sha'] == 'abc123'
    assert raw['metadata']['prompt_version'] == 7
    assert raw['metadata']['model'] == 'glm-4.7-flash'


# ---------------------------------------------------------------------------
# Round-trip integration
# ---------------------------------------------------------------------------


def test_round_trip_update_then_compare_yields_all_passed(tmp_path: Path):
    """After update_baseline, comparing the same results yields zero regressions.

    This is the safety check: a fresh baseline makes any future regression
    visible. If this round-trip is broken, the whole safety net is broken.
    """
    path = tmp_path / 'baseline.json'
    results = [
        _make_result('a', 's', 'chat', passed=True),
        _make_result('b', 's', 'chat', passed=False, errors=['known issue']),
    ]
    update_baseline(results, path=path)

    # Run the same results against the just-written baseline.
    report = compare_to_baseline(results, path=path)
    assert not report.regressions
    assert not report.improvements
    assert not report.new_tests
    assert len(report.passed) == 1
    assert len(report.failed) == 1


def test_round_trip_introducing_a_regression_is_detected(tmp_path: Path):
    """The motivating case: baseline says PASS, current run says FAIL.

    This is what blocks bad merges. If this test fails, the safety net
    has a hole.
    """
    path = tmp_path / 'baseline.json'
    # Establish baseline with everything passing.
    passing = [_make_result('feature_x', 's', 'chat', passed=True)]
    update_baseline(passing, path=path)

    # A code change introduces a failure.
    failing = [_make_result('feature_x', 's', 'chat', passed=False, errors=['regressed'])]
    report = compare_to_baseline(failing, path=path)

    assert report.has_regressions
    assert _entry_key('feature_x', 's', 'chat') in report.regressions
