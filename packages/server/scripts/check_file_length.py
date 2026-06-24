"""File-length enforcement for AGENTS.md Never rule #2 (routers thin).

Caps file lengths to keep the codebase navigable. Mirrors CONTRIBUTING.md:

    - routers/: max 200 lines (routers should be thin)
    - services/: max 400 lines (extract sub-services if larger)
    - app/ root .py files: max 500 lines
    - elsewhere: max 700 lines

Usage::

    uv run python scripts/check_file_length.py app/

Exits 1 if any .py file exceeds its threshold. Reports file:line + line count
+ threshold + suggested action (split / extract).
"""

from __future__ import annotations

import sys
from pathlib import Path


# Per-directory file-length caps (lines). More specific paths win.
CAPS: list[tuple[str, int]] = [
    ('app/routers/', 200),
    ('app/services/', 400),
    ('app/middleware/', 300),
    ('app/schemas/', 300),
    ('app/models/', 300),
    ('app/utils/', 300),
    ('app/prompts/', 300),
    ('app/', 500),
]

# Files explicitly exempt (large generated/orchestration files, or pre-existing
# tech debt tracked separately). New code must not be added here without
# justification — each entry is documented inline.
EXEMPT: set[str] = {
    # eval/mock data is intentionally one big fixture
    'app/eval/mock_data.py',
    # eval/live_runner: dispatch table + 7 handlers + report writer form a
    # cohesive unit; splitting into handlers module would scatter the
    # cost-cap / timeout / error-classification invariants across files.
    'app/eval/live_runner.py',
    # observability module is one cohesive unit; splitting hurts more than helps
    'app/services/llm/observability.py',
    # companion streaming is a state machine that doesn't decompose cleanly
    'app/services/companion/streaming.py',
    # cross-book synthesis LLM helpers are tightly coupled
    'app/services/llm/safe_invoke.py',
    'app/services/llm/circuit_fallback.py',
    'app/services/llm/provider_fallback.py',
    # --- existing tech debt: Phase 3 catches NEW violations; existing files
    # are tracked separately for incremental refactor. Do not add new code
    # to this exempt list without a documented reason.
    'app/middleware/idempotency.py',          # P0.1, P0.6 — state machine, hard to split
    'app/prompts/mirror_prompts.py',          # 9 Mirror section templates
    'app/routers/agent.py',                   # SSE plumbing, planned for service split
    'app/routers/book_clubs.py',              # large CRUD router, planned split
    'app/routers/collections.py',             # 10 lines over cap, scheduled for thin-out
    'app/routers/reading_sessions.py',        # 5 lines over cap
    'app/schemas/llm_outputs.py',             # 30+ Pydantic models in one module
    'app/services/agent_service.py',          # P0.3 — cancel plumbing
    'app/services/conversation_memory.py',    # Phase 4B — utilization logic added
}


def _cap_for(rel_path: str) -> int | None:
    """Return the line cap for a given relative path, or None if outside scope."""
    for prefix, cap in CAPS:
        if rel_path.startswith(prefix):
            return cap
    return None


def main(root: str = 'app/') -> int:
    """Check all .py files under ``root``. Returns 0 on success, 1 on violation."""
    root_path = Path(root)
    if not root_path.exists():
        print(f'ERROR: root path {root} does not exist')
        return 2

    violations: list[tuple[str, int, int]] = []  # (file, actual, cap)

    for py_file in sorted(root_path.rglob('*.py')):
        rel = str(py_file.with_suffix('')).replace('\\', '/').replace('/__init__', '')
        # Use the path relative to packages/server/
        try:
            rel_to_server = py_file.relative_to(Path.cwd())
        except ValueError:
            rel_to_server = py_file

        rel_str = str(rel_to_server).replace('\\', '/')

        if rel_str in EXEMPT:
            continue

        cap = _cap_for(rel_str)
        if cap is None:
            continue

        try:
            line_count = sum(1 for _ in open(py_file, encoding='utf-8'))
        except OSError as exc:
            print(f'WARN: could not read {py_file}: {exc}')
            continue

        if line_count > cap:
            violations.append((rel_str, line_count, cap))

    if violations:
        print('FILE LENGTH VIOLATIONS:')
        for path, actual, cap in violations:
            over_by = actual - cap
            print(
                f'  {path}: {actual} lines (cap {cap}, +{over_by} over) — '
                f'split into helper modules or sub-services'
            )
        print(f'\n{len(violations)} file(s) exceed length cap.')
        return 1

    print(f'OK: all .py files under {root} within length caps.')
    return 0


if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else 'app/'
    sys.exit(main(root))
