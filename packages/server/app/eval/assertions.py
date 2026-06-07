"""Eval assertion helpers — result tracking and output shape validation."""

from __future__ import annotations

from typing import Any


class EvalResult:
    """Result of a single golden test evaluation."""

    def __init__(self, name: str, service: str, action: str) -> None:
        self.name = name
        self.service = service
        self.action = action
        self.passed = True
        self.errors: list[str] = []

    def fail(self, msg: str) -> None:
        self.passed = False
        self.errors.append(msg)

    def __repr__(self) -> str:
        status = 'PASS' if self.passed else 'FAIL'
        return f'EvalResult({self.service}/{self.action}={status})'


def validate_output_shape(
    output: Any,
    expected: dict[str, Any],
    result: EvalResult,
) -> None:
    """Validate output against golden expectations."""
    expected_type = expected.get('type', 'str')

    # Type check
    if expected_type == 'str':
        if not isinstance(output, str):
            result.fail(f'Expected str, got {type(output).__name__}')
            return
    elif expected_type == 'dict':
        if not isinstance(output, dict):
            result.fail(f'Expected dict, got {type(output).__name__}')
            return

    # String checks
    if isinstance(output, str):
        if expected.get('not_empty') and not output.strip():
            result.fail('Output is empty')

        min_len = expected.get('min_length', 0)
        if min_len and len(output) < min_len:
            result.fail(f'Output too short: {len(output)} < {min_len}')

        for substr in expected.get('contains', []):
            if substr not in output:
                result.fail(f'Output missing expected substring: {substr!r}')

        for substr in expected.get('not_contains', []):
            if substr in output:
                result.fail(f'Output contains forbidden substring: {substr!r}')

    # Dict checks
    if isinstance(output, dict):
        for key in expected.get('required_keys', []):
            if key not in output:
                result.fail(f'Missing required key: {key!r}')

        for key, expected_val_type in expected.get('key_types', {}).items():
            if key in output:
                actual = output[key]
                if expected_val_type == 'list' and not isinstance(actual, list):
                    result.fail(f'Key {key!r}: expected list, got {type(actual).__name__}')
                elif expected_val_type == 'str' and not isinstance(actual, str):
                    result.fail(f'Key {key!r}: expected str, got {type(actual).__name__}')
