"""Router-thinness enforcement for AGENTS.md Never rule #2.

Routers must validate input → call service → return response. They must NOT:

- Issue direct DB queries (``db.execute``, ``db.query``, ``select(...)``,
  ``insert(...)``, ``update(...)``, ``delete(...)``)
- Contain business logic (loops over domain entities, calculation, branching
  on domain state)
- Construct SQLAlchemy models directly

Usage::

    uv run python scripts/check_router_thin.py app/routers/

Exits 1 on violation. Each violation reports file:line + offending AST node
+ suggested fix.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path


# DB-access patterns that must not appear in routers/.
DB_CALL_PATTERNS: frozenset[str] = frozenset({
    # SQLAlchemy AsyncSession API
    'execute', 'query', 'scalar', 'scalars', 'stream',
    'add', 'delete', 'merge', 'flush',
    # SQLAlchemy select() / dml constructs at module level
    'select', 'insert', 'update', 'delete',
    # direct db_error_guard belongs in services too (router delegates)
    'db_error_guard',
})

# Allowable router-level attribute accesses on the db session
ALLOWED_DB_ATTRS: frozenset[str] = frozenset({
    'commit', 'rollback', 'close',  # transaction lifecycle only
})

# Symbols that indicate a service call (allowed in routers)
SERVICE_INDICATORS: tuple[str, ...] = ('_service', 'service', 'Service')

# Files explicitly exempt (pre-existing tech debt tracked separately).
# Phase 3 catches NEW violations; existing files are scheduled for incremental
# refactor. Do not add new files here without a documented reason.
EXEMPT: set[str] = {
    'app/routers/agent.py',  # SSE plumbing with inline stream-state queries;
                             # planned for service extraction in a follow-up PR.
}


def _is_db_call(node: ast.AST) -> bool:
    """Return True if ``node`` is a direct DB-call expression."""
    # db.execute(...) / session.query(...) / etc.
    if isinstance(node, ast.Call):
        func = node.func
        if isinstance(func, ast.Attribute):
            if func.attr in DB_CALL_PATTERNS:
                # Check the receiver — `db.<attr>` or `session.<attr>`
                recv = func.value
                if isinstance(recv, ast.Name) and recv.id in {'db', 'session'}:
                    return True
        # bare select(...) / insert(...) / etc.
        if isinstance(func, ast.Name) and func.id in DB_CALL_PATTERNS:
            return True
    return False


def _check_file(path: Path) -> list[tuple[int, str]]:
    """Return list of (line_number, message) violations in ``path``."""
    try:
        source = path.read_text(encoding='utf-8')
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        return [(exc.lineno or 0, f'SYNTAX ERROR: {exc.msg}')]

    violations: list[tuple[int, str]] = []

    for node in ast.walk(tree):
        if _is_db_call(node):
            lineno = getattr(node, 'lineno', 0)
            # Allow if the receiver is a service object (e.g. user_service.get(...))
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                recv = node.func.value
                if isinstance(recv, ast.Name) and any(
                    ind in recv.id for ind in SERVICE_INDICATORS
                ):
                    continue
            violations.append((
                lineno,
                f'direct DB call {ast.dump(node.func)[:80]} — move to a service module',
            ))

    return violations


def main(root: str = 'app/routers/') -> int:
    """Check all router files. Returns 0 on success, 1 on violation."""
    root_path = Path(root)
    if not root_path.exists():
        print(f'ERROR: root {root} does not exist')
        return 2

    total_violations = 0
    for py_file in sorted(root_path.rglob('*.py')):
        if py_file.name == '__init__.py':
            continue
        rel = py_file.resolve().relative_to(Path.cwd().resolve())
        rel_str = str(rel).replace('\\', '/')
        if rel_str in EXEMPT:
            continue
        file_violations = _check_file(py_file)
        for lineno, msg in file_violations:
            print(f'  {rel}:{lineno}: {msg}')
        total_violations += len(file_violations)

    if total_violations:
        print(f'\n{total_violations} router-thickness violation(s) found.')
        return 1

    print(f'OK: all router files under {root} are thin (no direct DB calls).')
    return 0


if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else 'app/routers/'
    sys.exit(main(root))
