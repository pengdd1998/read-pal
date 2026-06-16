"""P3.4 tests: token budget ranking — per-section priority enforcement.

Validates that ``build_system_prompt`` applies the budget to each optional
section individually in priority order, so high-signal sections survive
in truncated form rather than being dropped wholesale.

The motivating regression: previously all optional sections were concate-
nated into one blob and one ``budget.add()`` call truncated the tail —
so if budget was tight, ``extra_context`` AND ``rag`` disappeared
entirely while a giant ``memory_summary`` survived intact. Per-section
budgeting trims proportionally: each section gets its fair share of
remaining budget, in priority order.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.services.companion.context_prompts import build_system_prompt
from app.utils.token_budget import TokenBudget


@dataclass
class FakeBook:
    """Minimal Book stand-in — only the fields build_system_prompt reads."""
    title: str = 'Test Book'
    author: str = 'Test Author'
    progress: float = 50.0
    current_page: int = 100
    total_pages: int = 200
    current_segment: int = 5
    status: str = 'reading'


# ---------------------------------------------------------------------------
# No-budget path: all sections present, ordering preserved
# ---------------------------------------------------------------------------


def test_no_budget_includes_all_sections_in_canonical_order():
    """Without budget pressure, sections appear in priority order, not source order.

    Build with sections supplied out-of-priority (rag before memory) and
    verify the rendered prompt still places memory BEFORE rag — because
    memory has higher priority (1) than rag (3).
    """
    book = FakeBook()
    prompt = build_system_prompt(
        book=book,
        annotations_ctx='user annotation',
        rag_ctx='retrieved chunk',
        memory_summary='remembered preference',
        budget=None,  # no truncation
    )

    memory_pos = prompt.find('Summary of previous conversation')
    rag_pos = prompt.find('Relevant passages')
    annotations_pos = prompt.find('annotations')

    assert memory_pos > 0, 'memory section missing'
    assert rag_pos > 0, 'rag section missing'
    assert annotations_pos > 0, 'annotations section missing'

    # Memory must come BEFORE rag in the rendered prompt (priority order).
    assert memory_pos < rag_pos, (
        f'memory (priority 1) should render before rag (priority 3); '
        f'got memory@{memory_pos}, rag@{rag_pos}'
    )


# ---------------------------------------------------------------------------
# Tight-budget path: per-section trimming
# ---------------------------------------------------------------------------


def test_tight_budget_keeps_high_priority_section_when_low_priority_drops():
    """Under tight budget, memory (priority 1) must survive even if
    extra_context (priority 4+) is dropped entirely.

    Regression case: under the old single-blob budgeting, a tight budget
    + a long extra_context blob would cause extra_context AND rag AND
    memory to be dropped together — losing the user's accumulated
    preferences alongside the bulk chapter content.
    """
    book = FakeBook()
    # Pathological case: huge extra_context that alone would eat the budget
    huge_extra = 'x' * 50_000  # ~12K tokens of chapter content
    long_memory = 'Reader cares about character development and pacing.'

    # Tight budget: only enough for system_prompt base + one short section.
    # Reserve must leave room for memory but not for huge_extra.
    budget = TokenBudget(model='glm-4.7-flash', response_reserve=127_500)

    prompt = build_system_prompt(
        book=book,
        annotations_ctx='',
        memory_summary=long_memory,
        context={'chapterContent': huge_extra},
        budget=budget,
    )

    # Memory must be present — it was added first (priority 1).
    assert 'Reader cares about character development' in prompt, (
        'high-priority memory section was dropped under tight budget; '
        'per-section ranking regression'
    )

    # Huge extra_context must have been truncated/dropped — its label
    # should appear in the truncation log.
    assert any('extra_0' in t for t in budget.truncations), (
        f'extra_context not budget-truncated; truncations: {budget.truncations}'
    )


def test_priority_order_memory_before_rag_under_pressure():
    """When budget can fit memory + partial rag but not all of rag,
    memory stays intact and rag gets trimmed — not the other way around."""
    book = FakeBook()
    long_memory = 'Reader has explored themes of loss and redemption.'
    long_rag = 'Retrieved passage. ' * 500  # sizeable RAG context

    # Budget: enough for system_prompt (~700) + memory (~12) + a sliver
    # of RAG, but not all of sanitized RAG (capped at 3000 chars ~750 tokens).
    # response_reserve=127_200 → budget = 800 tokens.
    # 700 (base) + 12 (memory) = 712 used; 88 tokens left for RAG.
    # RAG needs ~750 — must truncate.
    budget = TokenBudget(model='glm-4.7-flash', response_reserve=127_200)

    prompt = build_system_prompt(
        book=book,
        annotations_ctx='',
        memory_summary=long_memory,
        rag_ctx=long_rag,
        budget=budget,
    )

    assert 'themes of loss and redemption' in prompt, (
        'memory must survive intact when budget can fit it'
    )
    # RAG must have been truncated (label appears in truncations).
    assert 'rag' in budget.truncations, (
        f'rag should be truncated under pressure; got {budget.truncations}'
    )


def test_persona_reserved_before_optional_sections_trimmed():
    """Persona gets first claim on budget — even under tight budget, persona
    stays intact and optional sections give way."""
    book = FakeBook()
    persona_text = 'You are Sage, a wise and thoughtful companion.'
    long_memory = 'Memory ' * 1000
    long_rag = 'RAG ' * 1000

    budget = TokenBudget(model='glm-4.7-flash', response_reserve=127_000)

    prompt = build_system_prompt(
        book=book,
        annotations_ctx='',
        persona='sage',  # any valid persona key
        memory_summary=long_memory,
        rag_ctx=long_rag,
        budget=budget,
    )

    # Persona block must appear intact (reserved before trimming).
    assert '<persona>' in prompt
    assert '</persona>' in prompt


# ---------------------------------------------------------------------------
# Each section independently budgeted
# ---------------------------------------------------------------------------


def test_each_optional_section_gets_own_truncation_label():
    """When sections are trimmed, each appears under its own label in
    budget.truncations — confirming per-section budgeting (not one blob).

    We can't force ALL four to truncate because the sanitizer caps each
    input independently (memory at 1000, annotations at 2000, RAG at 3000,
    chapter at 8000 chars), and a budget tight enough to truncate all
    four would also drop the base system prompt. Instead: verify that
    individual section labels appear (not a single merged 'system_prompt'
    label covering everything) — that's the load-bearing distinction.
    """
    book = FakeBook()
    huge_memory = 'm' * 10_000
    huge_annotations = 'a' * 10_000
    huge_rag = 'r' * 10_000
    huge_extra = 'e' * 50_000  # extra large — must truncate even when others fit

    budget = TokenBudget(model='glm-4.7-flash', response_reserve=126_000)

    build_system_prompt(
        book=book,
        annotations_ctx=huge_annotations,
        rag_ctx=huge_rag,
        memory_summary=huge_memory,
        context={'chapterContent': huge_extra},
        budget=budget,
    )

    truncation_str = ','.join(budget.truncations)
    # The merged-blob regression would log only 'system_prompt' (one label)
    # because everything was concatenated into one budget.add() call.
    # Per-section budgeting logs individual labels.
    assert 'extra_0' in truncation_str, (
        f'extra_0 should be truncated individually; got {budget.truncations}'
    )
    # And we should NOT see only the merged 'system_prompt' label — that
    # would mean we regressed to the old single-blob behavior.
    if budget.truncations == ['system_prompt']:
        pytest.fail(
            'regression: only system_prompt label present — sections were '
            'budgeted as one blob instead of per-section'
        )


def test_extra_parts_get_indexed_labels():
    """When multiple extra_context parts exist, each gets its own label
    so debugging shows WHICH extra part was trimmed."""
    book = FakeBook()
    # Use sizes that exceed sanitizer caps so each part is at its cap.
    # chapterContent capped at 8000, bookDescription at 1000, nearbyCode at 2000.
    # Budget must be tight enough that chapter alone overflows after base prompt.
    budget = TokenBudget(model='glm-4.7-flash', response_reserve=126_500)

    build_system_prompt(
        book=book,
        annotations_ctx='',
        context={
            'chapterContent': 'c' * 50_000,
            'bookDescription': 'd' * 50_000,
            'nearbyCode': 'n' * 50_000,
        },
        budget=budget,
    )

    # At least one extra_N label should appear; the indexing scheme uses
    # 4 + enumerate(extra_parts) so labels are extra_0, extra_1, extra_2.
    assert any(label.startswith('extra_') for label in budget.truncations), (
        f'no extra_N labels in truncations: {budget.truncations}'
    )


# ---------------------------------------------------------------------------
# Empty-section handling
# ---------------------------------------------------------------------------


def test_empty_sections_dont_consume_budget():
    """Sections that are empty strings or None don't get added to the budget."""
    book = FakeBook()
    budget = TokenBudget(model='glm-4.7-flash', response_reserve=4_000)

    prompt_without = build_system_prompt(
        book=book,
        annotations_ctx='',
        rag_ctx='',
        memory_summary='',
        budget=budget,
    )
    used_empty = budget.used

    budget2 = TokenBudget(model='glm-4.7-flash', response_reserve=4_000)
    prompt_with = build_system_prompt(
        book=book,
        annotations_ctx='real annotation',
        rag_ctx='real rag',
        memory_summary='real memory',
        budget=budget2,
    )
    used_filled = budget2.used

    assert used_filled > used_empty, (
        'filled sections should consume more budget than empty ones'
    )


def test_no_optional_sections_still_renders_base_prompt():
    """Smoke: build_system_prompt works with zero optional sections."""
    book = FakeBook()
    prompt = build_system_prompt(
        book=book,
        annotations_ctx='',
        budget=None,
    )
    assert 'Test Book' in prompt
    assert 'Test Author' in prompt
