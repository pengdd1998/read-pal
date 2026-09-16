"""Raw-book-field enforcement for AGENTS.md Never rule #1.

Every ``book.title`` / ``book.author`` that flows into a prompt must route
through ``sanitize_book_field``. The previous grep-based check at
``.github/workflows/prompt-eval.yml`` had a bypass: ``grep -v sanitize_book_field``
let any line mentioning the function pass even if it also contained
``title=book.title`` elsewhere on the line.

This AST check replaces the grep. It walks every ``.py`` in ``app/services/``
and flags two patterns:

1. **kwarg form** — a ``Call`` keyword ``title=book.title`` etc. (the direct
   signature of prompt builders). Zero exemptions.
2. **dict form** — ``{'title': book.title, ...}``. Dicts reach prompts via
   ``json.dumps`` blobs (synthesis/memory_book/cross_book chains, fixed
   2026-09-16), so they sanitize at the choke point. The only exemption is
   an inline ``# rawfield: <reason>`` comment on the offending line for
   provably non-prompt consumers (API response serialization, file export) —
   grep ``'# rawfield:'`` to audit every exemption.

Usage::

    uv run python scripts/check_no_raw_book_fields.py app/services/

Exits 1 on violation. Each violation reports file:line + offending form
+ suggested wrap.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path


# Book attributes that must be sanitized before reaching a prompt.
RAW_FIELDS: frozenset[str] = frozenset({'title', 'author', 'description'})

# Domain object names that hold user-controlled text.
MODEL_NAMES: frozenset[str] = frozenset({'book', 'annotation', 'message', 'chapter'})

# Inline exemption marker required to carry a concrete reason.
RAWFIELD_MARKER = '# rawfield:'


def _is_sanitize_call(node: ast.AST) -> bool:
    """Return True if ``node`` is a ``sanitize_book_field(...)`` call."""
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    if isinstance(func, ast.Name) and func.id == 'sanitize_book_field':
        return True
    return isinstance(func, ast.Attribute) and func.attr == 'sanitize_book_field'


def _is_raw_book_attr(node: ast.AST) -> tuple[str, str] | None:
    """Return (model_name, field_name) if ``node`` is ``book.title`` etc."""
    if not isinstance(node, ast.Attribute):
        return None
    if node.attr not in RAW_FIELDS:
        return None
    if not isinstance(node.value, ast.Name):
        return None
    if node.value.id not in MODEL_NAMES:
        return None
    return (node.value.id, node.attr)


def _kwarg_violations(node: ast.Call) -> list[tuple[int, str]]:
    """Raw book attrs passed as title=/author= kwargs (prompt signatures)."""
    out: list[tuple[int, str]] = []
    for kw in node.keywords:
        if kw.arg is None:  # **kwargs spread
            continue
        if kw.arg not in RAW_FIELDS:
            continue
        match = _is_raw_book_attr(kw.value)
        if match is None:
            continue
        model, field = match
        lineno = getattr(kw, 'lineno', getattr(node, 'lineno', 0))
        out.append((
            lineno,
            f'raw {model}.{field} passed as {kw.arg}= '
            f'— wrap with sanitize_book_field({model}.{field}, field={field!r}) '
            f'before passing to prompt builder',
        ))
    return out


def _dict_violations(node: ast.Dict, lines: list[str]) -> list[tuple[int, str]]:
    """Raw book attrs as dict values — dicts reach prompts via json.dumps
    blobs. Exempt only with an inline rawfield reason."""
    out: list[tuple[int, str]] = []
    for key, value in zip(node.keys, node.values):
        if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
            continue  # **spread or non-string key
        if key.value not in RAW_FIELDS:
            continue
        match = _is_raw_book_attr(value)
        if match is None:
            continue
        model, field = match
        lineno = getattr(value, 'lineno', getattr(node, 'lineno', 0))
        if 0 < lineno <= len(lines) and RAWFIELD_MARKER in lines[lineno - 1]:
            continue
        out.append((
            lineno,
            f'raw {model}.{field} in dict under key {key.value!r} '
            f'— dict values reach prompts via json.dumps blobs; '
            f'sanitize at the choke point or mark the line with '
            f'"# rawfield: <reason>" if it provably never enters a prompt',
        ))
    return out


def _check_file(path: Path) -> list[tuple[int, str]]:
    """Return list of (line_number, message) violations in ``path``."""
    try:
        source = path.read_text(encoding='utf-8')
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        return [(exc.lineno or 0, f'SYNTAX ERROR: {exc.msg}')]

    lines = source.splitlines()
    violations: list[tuple[int, str]] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            # Skip sanitize_book_field calls themselves — their args are raw by design.
            if _is_sanitize_call(node):
                continue
            violations.extend(_kwarg_violations(node))
        elif isinstance(node, ast.Dict):
            violations.extend(_dict_violations(node, lines))

    return violations


def main(root: str = 'app/services/') -> int:
    """Check all service files. Returns 0 on success, 1 on violation."""
    root_path = Path(root)
    if not root_path.exists():
        print(f'ERROR: root {root} does not exist')
        return 2

    total_violations = 0
    for py_file in sorted(root_path.rglob('*.py')):
        if py_file.name == '__init__.py':
            continue
        rel = py_file.resolve().relative_to(Path.cwd().resolve())
        file_violations = _check_file(py_file)
        for lineno, msg in file_violations:
            print(f'  {rel}:{lineno}: {msg}')
        total_violations += len(file_violations)

    if total_violations:
        print(
            f'\n{total_violations} raw book-field kwarg(s)/dict value(s) found. '
            'Wrap with sanitize_book_field before interpolating into prompts.'
        )
        return 1

    print(f'OK: all book-field kwargs and dict values under {root} routed through sanitizer.')
    return 0


if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else 'app/services/'
    sys.exit(main(root))
