"""P2.5: Regression suite for prompt rendering.

Iterates through the curated test set in ``tests/fixtures/prompt_test_cases.py``
and asserts each prompt:
- Renders without exception
- Has no unrendered placeholders (``{xyz}`` left in output)
- Contains expected substrings (state-specific markers)
- Does NOT contain unexpected substrings (regression guards)
- Falls within reasonable length bounds (catches accidental bloat/trim)

The point of this suite is single-variable-change discipline: when a
prompt template is edited, this test localizes the regression to the
specific case it broke. Without it, prompt changes silently degrade
output for edge-case inputs (completed books, unknown progress, etc.).
"""

from __future__ import annotations

import re

import pytest

from app.prompts import MIRROR_SECTIONS, MIRROR_SYSTEM
from app.services.companion.context_prompts import build_system_prompt
from app.utils.token_budget import TokenBudget

from tests.fixtures.prompt_test_cases import (
    COMPANION_CASES,
    COMPANION_EDGE_CASES,
    MIRROR_FIXTURE_DATA,
    PromptTestCase,
)

# Matches unrendered Python format placeholders like "{progress}" or "{xyz}".
# Excludes JSON braces in mirror section templates (those use doubled braces
# {{ }} which render as literal { } and are NOT unrendered placeholders).
_UNRENDERED_PLACEHOLDER = re.compile(r'(?<!\{)\{[a-z_][a-z0-9_]*\}(?!\})')

# Sanity bounds for any rendered system prompt. Catches accidentally
# truncated prompts (<200 chars) and runaway bloat (>20k chars).
_MIN_PROMPT_LEN = 200
_MAX_PROMPT_LEN = 20_000


def _check_render_invariants(prompt: str, case_name: str) -> None:
    """Apply the cross-cutting checks every prompt must satisfy."""
    assert len(prompt) >= _MIN_PROMPT_LEN, (
        f'{case_name}: rendered prompt suspiciously short ({len(prompt)} chars)'
    )
    assert len(prompt) <= _MAX_PROMPT_LEN, (
        f'{case_name}: rendered prompt suspiciously long ({len(prompt)} chars)'
    )
    stray = _UNRENDERED_PLACEHOLDER.findall(prompt)
    # Some legitimate single-brace content can appear in JSON examples after
    # rendering; ignore the literal "{" character. The regex above already
    # excludes doubled braces.
    assert not stray, (
        f'{case_name}: unrendered placeholders left in prompt: {stray}'
    )


def _run_companion_case(case: PromptTestCase) -> str:
    """Render the companion system prompt for a single test case."""
    budget = TokenBudget()
    # Reserve slots the way _prepare_context does so the budget math matches prod
    budget.reserve('', 'history')
    budget.reserve('placeholder user message', 'user_message')
    return build_system_prompt(
        case.book,
        annotations_ctx=case.annotations_ctx,
        rag_ctx=case.rag_ctx,
        memory_summary=case.memory_summary,
        companion_mode=case.companion_mode,
        context=case.context,
        persona=case.persona,
        genre=case.genre,
        lang='en',
        budget=budget,
    )


@pytest.mark.parametrize(
    'case', COMPANION_CASES, ids=[c.name for c in COMPANION_CASES],
)
def test_companion_normal_cases(case: PromptTestCase):
    """All normal companion prompt variations render correctly."""
    prompt = _run_companion_case(case)
    _check_render_invariants(prompt, case.name)
    for needle in case.expected_substrings:
        assert needle in prompt, (
            f'{case.name}: expected {needle!r} in prompt'
        )
    for needle in case.unexpected_substrings:
        assert needle not in prompt, (
            f'{case.name}: unexpected {needle!r} in prompt'
        )


@pytest.mark.parametrize(
    'case', COMPANION_EDGE_CASES, ids=[c.name for c in COMPANION_EDGE_CASES],
)
def test_companion_edge_cases(case: PromptTestCase):
    """Edge-case inputs (completed, just-started, special chars) don't break rendering."""
    prompt = _run_companion_case(case)
    _check_render_invariants(prompt, case.name)
    for needle in case.expected_substrings:
        assert needle in prompt, (
            f'{case.name}: expected {needle!r} in prompt'
        )
    for needle in case.unexpected_substrings:
        assert needle not in prompt, (
            f'{case.name}: unexpected {needle!r} in prompt'
        )


@pytest.mark.parametrize(
    'section_type', sorted(MIRROR_FIXTURE_DATA.keys()),
)
def test_mirror_section_renders(section_type: str):
    """Every MIRROR_SECTIONS template renders without unrendered placeholders."""
    template = MIRROR_SECTIONS[section_type]
    data = MIRROR_FIXTURE_DATA[section_type]
    # Render the template with the fixture data; ignore missing keys would
    # mask bugs, so we use strict formatting.
    rendered = template.template.format(**data)
    _check_render_invariants(rendered, f'mirror.{section_type}')
    # SPARSE_DATA_GUARD must appear in every section (hallucination defense)
    assert 'If any data field above is empty' in rendered, (
        f'mirror.{section_type}: SPARSE_DATA_GUARD dropped from template'
    )
    # JSON scaffolding must remain (the schema contract for downstream parsing)
    assert 'Return JSON:' in rendered or '{' in rendered, (
        f'mirror.{section_type}: JSON scaffolding missing'
    )


def test_mirror_system_renders():
    """The MIRROR_SYSTEM meta-template renders with realistic values."""
    rendered = MIRROR_SYSTEM.template.format(
        book_title='Test Book',
        book_author='Test Author',
        section_prompt='Write the ENCOUNTER section...',
    )
    _check_render_invariants(rendered, 'mirror.system')
    assert 'Reading Mirror' in rendered
    assert 'Test Book' in rendered
    assert 'Test Author' in rendered


def test_companion_test_set_size():
    """Defense against accidentally shrinking the test set."""
    # The prompt-review skill recommends 10-30 cases per prompt family.
    # We need at least 10 normal + 5 edge to cover the documented paths.
    assert len(COMPANION_CASES) >= 10, (
        f'companion test set too small: {len(COMPANION_CASES)} cases'
    )
    assert len(COMPANION_EDGE_CASES) >= 5, (
        f'companion edge case set too small: {len(COMPANION_EDGE_CASES)} cases'
    )
    # Every persona should appear at least once in the test set
    personas_seen = {c.persona for c in COMPANION_CASES if c.persona}
    assert {'sage', 'penny', 'alex', 'quinn', 'sam'} <= personas_seen, (
        f'not all personas covered: {personas_seen}'
    )
    # Every genre should appear at least once
    genres_seen = {c.genre for c in COMPANION_CASES if c.genre}
    assert {'fiction', 'nonfiction', 'technical', 'academic'} <= genres_seen, (
        f'not all genres covered: {genres_seen}'
    )
