"""Encapsulation assertion for ``_INFLIGHT_STREAMS`` (m5, Phase 3.3).

The dict at ``app/services/agent_service.py:_INFLIGHT_STREAMS`` MUST be
mutated only through ``register_stream`` (line ~197) and ``release_stream``
(line ~205). Rogue inline mutations would break the cleanup contract
documented in the dict's docstring ("Entries MUST be removed in a finally
to avoid unbounded growth").

This script asserts the contract by scanning ``agent_service.py`` for any
``_INFLIGHT_STREAMS[...] = ...``, ``_INFLIGHT_STREAMS.pop(...)``,
``del _INFLIGHT_STREAMS[...]``, or ``_INFLIGHT_STREAMS.clear()`` and
verifying the enclosing function is one of the two allowed handlers.

Usage::

    uv run python scripts/check_inflight_streams_encapsulation.py \
        app/services/agent_service.py

Exits 1 on any rogue mutation.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path


ALLOWED_OWNERS: frozenset[str] = frozenset({
    'register_stream',
    'release_stream',
    # Internal helpers that delegate to register/release — extend only when
    # a new helper genuinely needs to touch the dict directly.
    '_ensure_cancel_listener',  # boots the cross-worker listener (read-only on dict)
})

DICT_NAME = '_INFLIGHT_STREAMS'


def _enclosing_function(node: ast.AST, tree: ast.Module) -> ast.FunctionDef | ast.AsyncFunctionDef | None:
    """Return the FunctionDef that encloses ``node`` in ``tree``."""
    for ancestor in ast.walk(tree):
        if not isinstance(ancestor, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for child in ast.walk(ancestor):
            if child is node:
                return ancestor
    return None


def _check_file(path: Path) -> list[tuple[int, str]]:
    """Return list of (line_number, message) violations in ``path``."""
    try:
        source = path.read_text(encoding='utf-8')
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        return [(exc.lineno or 0, f'SYNTAX ERROR: {exc.msg}')]

    violations: list[tuple[int, str]] = []

    for node in ast.walk(tree):
        # Detect: _INFLIGHT_STREAMS[k] = v
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if (
                    isinstance(target, ast.Subscript)
                    and isinstance(target.value, ast.Name)
                    and target.value.id == DICT_NAME
                ):
                    owner = _enclosing_function(node, tree)
                    owner_name = owner.name if owner else '<module-level>'
                    if owner_name not in ALLOWED_OWNERS:
                        violations.append((
                            getattr(node, 'lineno', 0),
                            f'_INFLIGHT_STREAMS mutation outside register_stream/release_stream '
                            f'(in {owner_name!r}) — use the encapsulated helpers',
                        ))
        # Detect: del _INFLIGHT_STREAMS[k]
        if isinstance(node, ast.Delete):
            for target in node.targets:
                if (
                    isinstance(target, ast.Subscript)
                    and isinstance(target.value, ast.Name)
                    and target.value.id == DICT_NAME
                ):
                    owner = _enclosing_function(node, tree)
                    owner_name = owner.name if owner else '<module-level>'
                    if owner_name not in ALLOWED_OWNERS:
                        violations.append((
                            getattr(node, 'lineno', 0),
                            f'del _INFLIGHT_STREAMS[...] outside release_stream '
                            f'(in {owner_name!r})',
                        ))
        # Detect: _INFLIGHT_STREAMS.pop(...) / .clear() / .update(...) / .setdefault(...)
        if isinstance(node, ast.Call):
            func = node.func
            if (
                isinstance(func, ast.Attribute)
                and isinstance(func.value, ast.Name)
                and func.value.id == DICT_NAME
                and func.attr in {'pop', 'clear', 'update', 'setdefault', 'popitem'}
            ):
                owner = _enclosing_function(node, tree)
                owner_name = owner.name if owner else '<module-level>'
                if owner_name not in ALLOWED_OWNERS:
                    violations.append((
                        getattr(node, 'lineno', 0),
                        f'_INFLIGHT_STREAMS.{func.attr}(...) outside register_stream/release_stream '
                        f'(in {owner_name!r})',
                    ))

    return violations


def main(target: str = 'app/services/agent_service.py') -> int:
    """Check the target file. Returns 0 on success, 1 on violation."""
    path = Path(target)
    if not path.exists():
        print(f'ERROR: {target} does not exist')
        return 2

    violations = _check_file(path)
    rel = path.resolve().relative_to(Path.cwd().resolve())
    for lineno, msg in violations:
        print(f'  {rel}:{lineno}: {msg}')

    if violations:
        print(
            f'\n{len(violations)} rogue _INFLIGHT_STREAMS mutation(s) found. '
            'All access must go through register_stream() / release_stream().'
        )
        return 1

    print(f'OK: _INFLIGHT_STREAMS mutations in {target} encapsulated correctly.')
    return 0


if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'app/services/agent_service.py'
    sys.exit(main(target))
