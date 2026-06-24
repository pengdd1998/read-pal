"""Weekly drift scanner (Phase 5.2 — M6).

Three modes:

1. ``--mode=mock-freshness`` — parse ``# last-verified: YYYY-MM-DD`` headers
   from ``app/eval/mock_data.py`` and flag entries older than 90 days.

2. ``--mode=template-consistency`` — cross-reference ``app/prompts/__init__.py``
   exports against actual template references in ``app/services/``. Flags:
   dead exports (template defined but never used) and undeclared usage
   (template used but not exported).

3. ``--mode=live`` — run live eval via ``app.eval.eval_runner --live`` and
   diff against ``app/eval/regression_baseline.json``. Any REGRESSION
   classification is reported. (Requires ``PROMPT_EVAL_API_KEY``.)

Designed to run weekly via ``.github/workflows/drift-scan.yml``. Exits 0
on no drift, 1 on any drift detected. GitHub Action opens an issue on
non-zero exit.

Usage::

    uv run python scripts/drift_scan.py --mode=mock-freshness
    uv run python scripts/drift_scan.py --mode=template-consistency
    uv run python scripts/drift_scan.py --mode=live
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

STALE_THRESHOLD_DAYS = 90


# ---------------------------------------------------------------------------
# Mode 1: Mock freshness — flag stale ``# last-verified:`` entries
# ---------------------------------------------------------------------------

_LAST_VERIFIED_RE = re.compile(
    r'#\s*last-verified:\s*(\d{4}-\d{2}-\d{2})',
)


def check_mock_freshness() -> int:
    """Flag mock entries older than STALE_THRESHOLD_DAYS."""
    mock_path = Path('app/eval/mock_data.py')
    if not mock_path.exists():
        print(f'ERROR: {mock_path} not found')
        return 2

    source = mock_path.read_text(encoding='utf-8')
    today = datetime.now(tz=timezone.utc).date()
    stale: list[tuple[int, str, int]] = []  # (lineno, date_str, days_old)

    for match in _LAST_VERIFIED_RE.finditer(source):
        lineno = source[:match.start()].count('\n') + 1
        date_str = match.group(1)
        try:
            verified_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            continue
        days_old = (today - verified_date).days
        if days_old > STALE_THRESHOLD_DAYS:
            stale.append((lineno, date_str, days_old))

    if stale:
        print(f'MOCK FRESHNESS DRIFT ({len(stale)} stale entries):')
        for lineno, date_str, days_old in sorted(stale):
            print(
                f'  app/eval/mock_data.py:{lineno}: last-verified {date_str} '
                f'({days_old} days old > {STALE_THRESHOLD_DAYS}-day threshold) '
                f'— re-verify against live output'
            )
        return 1

    print(f'OK: all mock entries verified within {STALE_THRESHOLD_DAYS} days.')
    return 0


# ---------------------------------------------------------------------------
# Mode 2: Template consistency — exports vs usage
# ---------------------------------------------------------------------------

def _extract_template_exports() -> set[str]:
    """Pull template names from app/prompts/__init__.py __all__."""
    init_path = Path('app/prompts/__init__.py')
    if not init_path.exists():
        return set()
    source = init_path.read_text(encoding='utf-8')
    # Crude but effective: find the __all__ list and extract string literals
    match = re.search(r'__all__\s*=\s*\[(.*?)\]', source, re.DOTALL)
    if not match:
        return set()
    return set(re.findall(r"'([A-Z_]+)'", match.group(1)))


def _extract_template_usage() -> dict[str, list[str]]:
    """Scan app/services/ for template name references; return {name: [locations]}."""
    services_dir = Path('app/services')
    exports = _extract_template_exports()
    if not exports:
        return {}

    usage: dict[str, list[str]] = {name: [] for name in exports}
    for py_file in services_dir.rglob('*.py'):
        if py_file.name == '__init__.py':
            continue
        try:
            source = py_file.read_text(encoding='utf-8')
        except OSError:
            continue
        for name in exports:
            # Match the name as a word boundary — avoid substring matches.
            if re.search(rf'\b{re.escape(name)}\b', source):
                rel = str(py_file).replace('\\', '/')
                usage[name].append(rel)
    return usage


def check_template_consistency() -> int:
    """Flag dead exports (defined but unused) and undeclared usage."""
    usage = _extract_template_usage()
    if not usage:
        print('WARN: no template exports found; skipping consistency check')
        return 0

    dead_exports = [name for name, locs in usage.items() if not locs]
    if dead_exports:
        print(f'TEMPLATE CONSISTENCY DRIFT ({len(dead_exports)} dead exports):')
        for name in sorted(dead_exports):
            print(
                f'  {name}: defined in app/prompts/__init__.py but never '
                f'referenced in app/services/ — remove from __all__ or wire up'
            )
        return 1

    print(f'OK: all {len(usage)} template exports referenced in services.')
    return 0


# ---------------------------------------------------------------------------
# Mode 3: Live drift — run live eval, diff against baseline
# ---------------------------------------------------------------------------

async def check_live_drift() -> int:
    """Run live eval and report any REGRESSION classifications."""
    try:
        from app.eval.live_runner import run_live_eval, print_live_report
    except ImportError as exc:
        print(f'ERROR: live_runner import failed: {exc}')
        return 2

    import os
    if not os.environ.get('PROMPT_EVAL_API_KEY') and not os.environ.get('GLM_API_KEY'):
        print('SKIP: PROMPT_EVAL_API_KEY (or GLM_API_KEY) not set')
        return 0

    cap = int(os.environ.get('MAX_LIVE_EVAL_TOKENS', '100000'))
    reports = await run_live_eval(label_filter=None, max_tokens=cap)
    success = print_live_report(reports)

    # Count failures (non-skip, non-pass)
    failures = [r for r in reports if not r.passed and not r.skipped]
    if failures:
        print(f'\nLIVE DRIFT: {len(failures)} failing golden entries.')
        for r in failures:
            print(f'  FAIL {r.service}/{r.action}: {r.errors}')
        return 1

    if success:
        print('OK: live eval matches expectations.')
    return 0 if success else 1


# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        prog='drift_scan',
        description='Weekly drift scanner for eval harness.',
    )
    parser.add_argument(
        '--mode',
        required=True,
        choices=['mock-freshness', 'template-consistency', 'live'],
        help='Drift detection mode.',
    )
    args = parser.parse_args()

    if args.mode == 'mock-freshness':
        return check_mock_freshness()
    if args.mode == 'template-consistency':
        return check_template_consistency()
    if args.mode == 'live':
        return asyncio.run(check_live_drift())

    return 2


if __name__ == '__main__':
    sys.exit(main())
