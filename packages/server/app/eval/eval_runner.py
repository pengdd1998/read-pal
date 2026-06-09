"""Evaluation runner — validates LLM prompt + output quality against golden dataset.

Runs in two modes:
1. Unit mode (default): Tests infrastructure pipeline with mocked LLM responses.
   Validates sanitization, token budgeting, schema validation, and output filtering.
2. Live mode (opt-in): Sends real prompts to the LLM and validates output shapes.
   Used for manual regression testing, not in CI.

Usage:
    # Unit tests (CI-safe, no API calls)
    uv run pytest tests/test_eval_golden.py -v

    # Live regression test (requires GLM_API_KEY)
    uv run python -m app.eval.eval_runner --live
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Any

from app.eval.assertions import EvalResult, validate_output_shape
from app.eval.golden_dataset import ALL_GOLDEN
from app.eval.mock_data import MOCK_RESPONSES, SCHEMA_MAP
from app.eval.regression import run_sanitizer_regression, run_token_budget_regression
from app.utils.output_filter import filter_output, validate_schema
from app.utils.sanitizer import sanitize_chat_message
from app.utils.token_budget import TokenBudget

logger = logging.getLogger('read-pal.eval')

# Re-export for backward compatibility
__all__ = [
    'EvalResult',
    'MOCK_RESPONSES',
    'SCHEMA_MAP',
    'run_all',
    'run_sanitizer_regression',
    'run_token_budget_regression',
    'run_unit_eval',
    'validate_output_shape',
]


# ---------------------------------------------------------------------------
# Unit-mode evaluation (mocked LLM)
# ---------------------------------------------------------------------------

def _test_sanitization(
    golden: dict[str, Any],
    action: str,
    result: EvalResult,
) -> None:
    """Validate input sanitization and injection wrapping."""
    message = golden['input'].get('message', '')
    if not message:
        return

    sanitized = sanitize_chat_message(message)
    if not sanitized:
        result.fail('Sanitization produced empty output')

    if 'injection' not in action:
        return

    injection_patterns = [
        'ignore previous instructions',
        'forget everything',
        'you are now a',
    ]
    for pattern in injection_patterns:
        if pattern.lower() in message.lower():
            if 'BEGIN USER PROVIDED DATA' not in sanitized:
                result.fail(f'Injection pattern not wrapped: {pattern!r}')


def _test_token_budget(
    service: str,
    action: str,
    result: EvalResult,
) -> str:
    """Validate token budgeting. Returns the mock response for reuse."""
    budget = TokenBudget()
    mock_response = MOCK_RESPONSES.get(service, {}).get(action, '')
    budget.add(mock_response, label=f'{service}_{action}')
    if budget.remaining <= 0:
        result.fail('Token budget exhausted on single response')
    return mock_response


def _test_schema_validation(
    service: str,
    action: str,
    name: str,
    expected: dict,
    mock_response: str,
    result: EvalResult,
) -> None:
    """Validate structured (JSON) outputs against schema."""
    schema_map = SCHEMA_MAP.get(service, {})
    schema_class = schema_map.get(action)
    if not schema_class or not mock_response:
        return

    try:
        parsed = json.loads(mock_response)
        validated = validate_schema(parsed, schema_class, context=name)
        if not validated:
            result.fail('Schema validation returned empty dict')
        validate_output_shape(validated, expected, result)
    except json.JSONDecodeError as exc:
        result.fail(f'Mock response is not valid JSON: {exc}')


def _test_output_filtering(
    expected: dict,
    name: str,
    mock_response: str,
    result: EvalResult,
) -> None:
    """Validate text output filtering and shape."""
    if expected.get('type') != 'str' or not mock_response:
        return

    filtered = filter_output(mock_response, context=name)
    validate_output_shape(filtered, expected, result)


def run_unit_eval() -> list[EvalResult]:
    """Run golden dataset tests against infrastructure with mock LLM responses.

    Tests: sanitization pipeline, token budgeting, schema validation,
    output filtering, and prompt construction -- all without real API calls.
    """
    results: list[EvalResult] = []

    for golden in ALL_GOLDEN:
        service = golden['service']
        action = golden['action']
        name = f'{service}/{action}'
        result = EvalResult(name, service, action)

        _test_sanitization(golden, action, result)

        mock_response = _test_token_budget(service, action, result)

        _test_schema_validation(
            service, action, name, golden['expected_output'],
            mock_response, result,
        )

        _test_output_filtering(
            golden['expected_output'], name, mock_response, result,
        )

        results.append(result)

    return results


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def print_report(results: list[EvalResult]) -> bool:
    """Print eval report. Returns True if all passed."""
    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    total = len(results)

    print(f'\n{"=" * 60}')
    print(f'EVAL RESULTS: {passed}/{total} passed, {failed} failed')
    print(f'{"=" * 60}')

    for r in results:
        icon = 'PASS' if r.passed else 'FAIL'
        print(f'  {icon} {r.service}/{r.action}')
        for err in r.errors:
            print(f'    -> {err}')

    if failed:
        print(f'\n{"=" * 60}')
        print(f'FAILURES ({failed}):')
        for r in results:
            if not r.passed:
                print(f'  FAIL {r.service}/{r.action}')
                for err in r.errors:
                    print(f'    -> {err}')

    return failed == 0


def run_all() -> bool:
    """Run all eval suites. Returns True if all passed."""
    all_results: list[EvalResult] = []

    all_results.extend(run_unit_eval())
    all_results.extend(run_token_budget_regression())
    all_results.extend(run_sanitizer_regression())

    return print_report(all_results)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    success = run_all()
    sys.exit(0 if success else 1)
