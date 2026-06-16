"""P4.1: Regression baseline — persists eval outcomes so prompt/model
changes can be attributed and previously-passing tests can't silently
regress.

The context-review skill's evaluation-harness check (Phase 2 / K) calls
out "regression set replayed on changes" and "single-variable change
discipline". This module is the minimal infrastructure for both:

- ``load_baseline(path)`` — read the JSON snapshot of last-known pass/fail
- ``compare_to_baseline(current, baseline)`` — classify each result as
  PASS/FAIL/REGRESSION/IMPROVEMENT/NEW. Returns a report.
- ``update_baseline(current, path)`` — overwrite the snapshot after an
  intentional change.

Workflow:
1. ``compare`` mode runs in CI. Exit code 1 if any REGRESSION — blocks merge.
2. ``update`` mode is run manually after an intentional prompt change.

The baseline lives at ``app/eval/regression_baseline.json`` and is checked
into git. Diff history provides the "what changed Tuesday?" trail the
skill calls for.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from app.eval.assertions import EvalResult

# Default location — colocated with the eval package so it ships with
# the codebase and is visible in code review.
DEFAULT_BASELINE_PATH = Path(__file__).parent / 'regression_baseline.json'


@dataclass
class BaselineEntry:
    """One test's recorded state in the baseline."""
    name: str
    service: str
    action: str
    passed: bool
    errors: list[str] = field(default_factory=list)


@dataclass
class RegressionReport:
    """Categorized diff between current eval run and the baseline."""
    passed: list[str] = field(default_factory=list)       # was passing, still passing
    failed: list[str] = field(default_factory=list)       # was failing, still failing
    regressions: list[str] = field(default_factory=list)  # was passing, NOW FAILING
    improvements: list[str] = field(default_factory=list)  # was failing, NOW PASSING
    new_tests: list[str] = field(default_factory=list)    # not in baseline

    @property
    def has_regressions(self) -> bool:
        return bool(self.regressions)

    def summary(self) -> str:
        lines = [
            f'Eval regression report:',
            f'  passed:        {len(self.passed):4d}',
            f'  failed:        {len(self.failed):4d}  (pre-existing, not regressions)',
            f'  regressions:   {len(self.regressions):4d}  (NEW FAILURES — must fix before merge)',
            f'  improvements:  {len(self.improvements):4d}  (newly passing — nice work)',
            f'  new_tests:     {len(self.new_tests):4d}  (no baseline entry)',
        ]
        if self.regressions:
            lines.append('')
            lines.append('Regressions:')
            for name in self.regressions:
                lines.append(f'  - {name}')
        return '\n'.join(lines)


def _entry_key(name: str, service: str, action: str) -> str:
    """Stable identifier for a baseline entry.

    (name, service, action) is the natural composite key — name alone
    could collide if two eval paths produce the same name.
    """
    return f'{service}::{action}::{name}'


def load_baseline(path: Path | None = None) -> dict[str, BaselineEntry]:
    """Load the baseline file. Returns ``{}`` if missing or unreadable.

    Missing-baseline-is-empty (not an error) is intentional: the very
    first run on a fresh checkout shouldn't crash. ``compare_to_baseline``
    then treats every current test as NEW, which is correct.
    """
    path = path or DEFAULT_BASELINE_PATH
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, OSError):
        # Corrupted baseline — treat as empty so the comparator reports
        # everything as NEW. Don't auto-overwrite; that would mask the
        # corruption from a human reviewer.
        return {}
    if not isinstance(raw, dict) or 'entries' not in raw:
        return {}

    out: dict[str, BaselineEntry] = {}
    for entry_data in raw['entries']:
        try:
            entry = BaselineEntry(
                name=entry_data['name'],
                service=entry_data['service'],
                action=entry_data['action'],
                passed=bool(entry_data['passed']),
                errors=list(entry_data.get('errors', [])),
            )
            out[_entry_key(entry.name, entry.service, entry.action)] = entry
        except (KeyError, TypeError):
            # Skip malformed entries; the rest of the baseline still loads.
            continue
    return out


def compare_to_baseline(
    current: list[EvalResult],
    baseline: dict[str, BaselineEntry] | None = None,
    path: Path | None = None,
) -> RegressionReport:
    """Categorize current eval results against the baseline.

    ``baseline`` is loaded from ``path`` if not provided. Both being
    None falls back to DEFAULT_BASELINE_PATH.
    """
    if baseline is None:
        baseline = load_baseline(path)

    report = RegressionReport()
    for result in current:
        key = _entry_key(result.name, result.service, result.action)
        prior = baseline.get(key)

        if prior is None:
            report.new_tests.append(key)
            continue

        if result.passed and prior.passed:
            report.passed.append(key)
        elif not result.passed and not prior.passed:
            report.failed.append(key)
        elif result.passed and not prior.passed:
            report.improvements.append(key)
        else:  # not result.passed and prior.passed
            report.regressions.append(key)

    return report


def update_baseline(
    current: list[EvalResult],
    path: Path | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Persist current results as the new baseline.

    Should only be called after an INTENTIONAL change (new prompt, model
    bump, schema extension). Accidentally calling this on a broken run
    would erase the regression safety net.

    Metadata is optional and stored alongside entries — useful for
    recording the git SHA, prompt_version, or model name at baseline time.
    """
    path = path or DEFAULT_BASELINE_PATH
    # Sort entries by composite key so the on-disk file is diff-stable
    # across runs — same input always produces byte-identical output,
    # which makes code review of baseline changes tractable.
    sorted_results = sorted(
        current,
        key=lambda r: _entry_key(r.name, r.service, r.action),
    )
    payload = {
        'metadata': metadata or {},
        'entries': [
            {
                'name': r.name,
                'service': r.service,
                'action': r.action,
                'passed': r.passed,
                'errors': list(r.errors),
            }
            for r in sorted_results
        ],
    }
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True) + '\n',
        encoding='utf-8',
    )


def results_to_entries(results: list[EvalResult]) -> list[dict[str, Any]]:
    """Helper for tests: convert EvalResults to plain dicts.

    Mirrors the on-disk shape so tests can assert on baseline contents
    without coupling to EvalResult's internal fields.
    """
    return [asdict(BaselineEntry(
        name=r.name, service=r.service, action=r.action,
        passed=r.passed, errors=list(r.errors),
    )) for r in results]
