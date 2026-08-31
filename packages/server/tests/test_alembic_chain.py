"""Migration chain integrity tests — pure AST analysis, no database required.

The worst production incident in this project's history was a migration bug.
These tests catch the structural failures that cause it: multiple heads
(alembic refuses to upgrade), duplicate revision ids (silently shadowed
migrations), and dangling down_revisions (upgrade crashes mid-chain).

Files are parsed with `ast` rather than imported so no migration module ever
executes (migrations can have heavy transitive imports).
"""

import ast
from pathlib import Path

import pytest

VERSIONS_DIR = (
    Path(__file__).resolve().parent.parent / 'alembic' / 'versions'
)

# Alembic sentinel values that mean "no parent" (root of the chain).
_NONE_SENTINELS = {None, 'None'}


def _extract_revisions(path: Path) -> tuple[object, object]:
    """Return (revision, down_revision) parsed from one migration file.

    Handles both `revision = 'x'` and `revision: str = 'x'` declaration
    styles. Returns (None, None) when a file declares no revision id.
    """
    tree = ast.parse(path.read_text(encoding='utf-8'))
    revision: object = None
    down_revision: object = None
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets, value = [node.target], node.value
        else:
            continue
        for target in targets:
            if not isinstance(target, ast.Name) or not isinstance(
                value, ast.Constant
            ):
                continue
            if target.id == 'revision':
                revision = value.value
            elif target.id == 'down_revision':
                down_revision = value.value
    return revision, down_revision


def _load_chain() -> dict[str, tuple[str, object]]:
    """Map revision id -> (file name, down_revision)."""
    chain: dict[str, tuple[str, object]] = {}
    for path in sorted(VERSIONS_DIR.glob('*.py')):
        revision, down_revision = _extract_revisions(path)
        if revision is None:
            continue
        chain[str(revision)] = (path.name, down_revision)
    return chain


def test_versions_directory_exists() -> None:
    assert VERSIONS_DIR.is_dir(), f'missing directory: {VERSIONS_DIR}'


def test_every_migration_file_declares_a_revision() -> None:
    for path in sorted(VERSIONS_DIR.glob('*.py')):
        revision, _ = _extract_revisions(path)
        assert revision is not None, (
            f'{path.name} declares no `revision` literal'
        )


def test_no_duplicate_revision_ids() -> None:
    seen: dict[str, list[str]] = {}
    for path in sorted(VERSIONS_DIR.glob('*.py')):
        revision, _ = _extract_revisions(path)
        if revision is None:
            continue
        seen.setdefault(str(revision), []).append(path.name)
    duplicates = {rev: files for rev, files in seen.items() if len(files) > 1}
    assert not duplicates, (
        f'duplicate revision ids (silently shadowed migrations): {duplicates}'
    )


def test_exactly_one_head() -> None:
    chain = _load_chain()
    assert chain, 'no migrations found'
    children = {down for _, down in chain.values() if down is not None}
    heads = sorted(rev for rev in chain if rev not in children)
    assert len(heads) == 1, (
        f'expected exactly 1 head, found {len(heads)}: {heads}. '
        'Multiple heads make `alembic upgrade head` fail in production.'
    )


def test_exactly_one_root() -> None:
    chain = _load_chain()
    roots = sorted(rev for rev, (_, down) in chain.items() if down is None)
    assert len(roots) == 1, (
        f'expected exactly 1 root revision (down_revision=None), '
        f'found {len(roots)}: {roots}'
    )


def test_every_down_revision_resolves() -> None:
    chain = _load_chain()
    ids = set(chain)
    dangling = {
        rev: (fname, down)
        for rev, (fname, down) in chain.items()
        if down is not None and down not in _NONE_SENTINELS and down not in ids
    }
    assert not dangling, (
        f'down_revision points to a non-existent revision: {dangling}'
    )


def test_down_revision_is_not_self() -> None:
    chain = _load_chain()
    self_referencing = [
        rev for rev, (_, down) in chain.items() if down == rev
    ]
    assert not self_referencing, (
        f'revisions whose down_revision is themselves: {self_referencing}'
    )


def test_chain_is_acyclic_and_fully_connected() -> None:
    """Walk forward from the single root via child links; every revision must
    be reachable exactly once, which proves both acyclicity and connectivity."""
    chain = _load_chain()
    parent_of = {
        rev: (None if down in _NONE_SENTINELS else str(down))
        for rev, (_, down) in chain.items()
    }
    children: dict[str, list[str]] = {}
    for rev, parent in parent_of.items():
        if parent is not None:
            children.setdefault(parent, []).append(rev)

    roots = [rev for rev, parent in parent_of.items() if parent is None]
    assert len(roots) == 1, 'chain must have a single root for this walk'

    seen: set[str] = set()
    stack: list[str] = [roots[0]]
    while stack:
        current = stack.pop()
        assert current not in seen, (
            f'cycle detected in migration chain at revision {current!r}'
        )
        seen.add(current)
        stack.extend(children.get(current, []))
    assert len(seen) <= len(parent_of), (
        'migration chain walk exceeded revision count — cycle detected'
    )

    unreachable = set(parent_of) - seen
    assert not unreachable, (
        f'revisions unreachable from root: {sorted(unreachable)}'
    )


@pytest.mark.parametrize(
    'known_good_head',
    ['0026'],
)
def test_head_is_the_expected_revision(known_good_head: str) -> None:
    """Guards against an accidental new branch: bump this constant in the
    same commit that adds a new head so the change is a conscious one."""
    chain = _load_chain()
    children = {down for _, down in chain.values() if down is not None}
    heads = sorted(rev for rev in chain if rev not in children)
    assert heads == [known_good_head], (
        f'head moved from {known_good_head!r} to {heads}. '
        'If intentional, update `known_good_head` in this test.'
    )
