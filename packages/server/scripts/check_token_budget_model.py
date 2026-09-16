"""TokenBudget model-kwarg enforcement for AGENTS.md Never rule #3.

``TokenBudget()`` defaults to ``model='glm-4.7-flash'``. On a non-GLM
active provider that silently estimates against the wrong context window:
truncation points land in the wrong place and long prompts either overflow
the real window or get cut far too early. Every construction must declare
``model=get_settings().default_model`` (or the call site's own model).

This AST check walks ``app/services/`` and ``app/eval/`` and flags every
``TokenBudget(...)`` call that lacks a ``model=`` keyword. Zero exemptions:
the declaration is one line and always available — there is no legitimate
reason to depend on the default (the default exists only for backwards
compatibility of the constructor signature).

Usage::

    uv run python scripts/check_token_budget_model.py app/services/ app/eval/

Exits 1 on violation. Each violation reports file:line + suggested fix.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path


def _is_token_budget_call(node: ast.AST) -> bool:
    """Return True if ``node`` is a ``TokenBudget(...)`` call."""
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    if isinstance(func, ast.Name) and func.id == 'TokenBudget':
        return True
    return isinstance(func, ast.Attribute) and func.attr == 'TokenBudget'


def _check_file(path: Path) -> list[tuple[int, str]]:
    """Return list of (line_number, message) violations in ``path``."""
    try:
        source = path.read_text(encoding='utf-8')
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        return [(exc.lineno or 0, f'SYNTAX ERROR: {exc.msg}')]

    violations: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not _is_token_budget_call(node):
            continue
        if any(kw.arg == 'model' for kw in node.keywords):
            continue
        lineno = getattr(node, 'lineno', 0)
        violations.append((
            lineno,
            'TokenBudget() without model= — silent wrong-window estimate on '
            'non-GLM providers; pass model=get_settings().default_model '
            '(or the call site\'s own model)',
        ))
    return violations


def main(roots: list[str] | None = None) -> int:
    """Check service and eval files. Returns 0 on success, 1 on violation."""
    roots = roots or ['app/services/', 'app/eval/']
    total_violations = 0
    for root in roots:
        root_path = Path(root)
        if not root_path.exists():
            print(f'ERROR: root {root} does not exist')
            return 2
        for py_file in sorted(root_path.rglob('*.py')):
            if py_file.name == '__init__.py':
                continue
            rel = py_file.resolve().relative_to(Path.cwd().resolve())
            for lineno, msg in _check_file(py_file):
                print(f'  {rel}:{lineno}: {msg}')
                total_violations += 1

    if total_violations:
        print(
            f'\n{total_violations} bare TokenBudget call(s) found. '
            'Declare model= at every construction site.'
        )
        return 1

    print('OK: every TokenBudget construction declares model=.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:] or None))
