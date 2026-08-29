"""Unit tests for PromptTemplate.render() and prompt-escaping invariants.

Covers the restored prompt infrastructure:
- render() provides a centralized substitution API with type coercion
- Raw-consumed system prompts must not contain ``{{`` leaks
- __post_init__ drift check fires when declared variables mismatch template placeholders
- i18n translation lookup is no longer in render() (removed during i18n refactor)
"""

from __future__ import annotations

import pytest

from app.prompts import (
    BOOK_COMPARE_SYSTEM,
    CONVERSATION_SUMMARY_HUMAN,
    CROSS_BOOK_SYNTHESIS_SYSTEM,
    FLASHCARD_GENERATION_SYSTEM,
    KNOWLEDGE_EXTRACTION_SYSTEM,
    MIRROR_SYSTEM,
    STUDY_CONCEPT_CHECKS_SYSTEM,
    STUDY_OBJECTIVES_SYSTEM,
    SYNTHESIS_HUMAN,
    SYNTHESIS_SYSTEM,
)
from app.prompts.base import PromptTemplate, _extract_placeholders


# ---------------------------------------------------------------------------
# render() — basic semantics
# ---------------------------------------------------------------------------


def _template(template: str, variables: list[str] | None = None) -> PromptTemplate:
    """Helper to build an ad-hoc PromptTemplate for testing."""
    return PromptTemplate(
        key='test.adhoc',
        version=1,
        template=template,
        variables=variables or [],
    )


def test_render_with_no_kwargs_returns_template_unchanged() -> None:
    """When no kwargs are passed, render() short-circuits and returns raw."""
    tmpl = _template('Static content with no placeholders.')
    assert tmpl.render() == 'Static content with no placeholders.'


def test_render_substitutes_simple_placeholders() -> None:
    """Standard {var} substitution works."""
    tmpl = _template('Book: {title} by {author}', variables=['title', 'author'])
    assert tmpl.render(title='Dune', author='Herbert') == 'Book: Dune by Herbert'


def test_render_passes_braces_in_user_values_verbatim() -> None:
    """Braces in user-supplied values pass through unchanged.

    str.format() does not re-parse substituted values, so a book title like
    '{Excerpt}' is inserted literally — no KeyError, no escape artifacts.
    """
    tmpl = _template('Title: {title}', variables=['title'])
    result = tmpl.render(title='{Excerpt}')
    assert result == 'Title: {Excerpt}'


def test_render_preserves_double_braces_in_template() -> None:
    """Templates that legitimately use {{...}} for literal JSON keep working
    after .render() is called — the {{ }} escape pair collapses to { }.
    """
    tmpl = _template('Return JSON like {{"key": "{value}"}}', variables=['value'])
    result = tmpl.render(value='hello')
    assert result == 'Return JSON like {"key": "hello"}'


def test_render_handles_curly_brace_in_annotation_text() -> None:
    """A user note containing stray braces must pass through cleanly."""
    tmpl = _template('Notes:\n{annotations}', variables=['annotations'])
    result = tmpl.render(annotations='function foo() { return 42; }')
    assert 'function foo() { return 42; }' in result


def test_render_coerces_non_string_values() -> None:
    """Non-string values (int, None, float) are coerced via str()."""
    tmpl = _template('count={count} progress={progress}', variables=['count', 'progress'])
    result = tmpl.render(count=5, progress=0.5)
    assert result == 'count=5 progress=0.5'


# ---------------------------------------------------------------------------
# Render collapses {{ }} escapes (templates that use them for JSON examples)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    'tmpl',
    [
        SYNTHESIS_SYSTEM,
        CROSS_BOOK_SYNTHESIS_SYSTEM,
        BOOK_COMPARE_SYSTEM,
        STUDY_OBJECTIVES_SYSTEM,
        STUDY_CONCEPT_CHECKS_SYSTEM,
        KNOWLEDGE_EXTRACTION_SYSTEM,
    ],
    ids=lambda t: t.key,
)
def test_json_template_renders_without_double_brace_leak(tmpl: PromptTemplate) -> None:
    """Templates that contain ``{{...}}`` as format-string escapes for JSON
    examples must collapse to single braces after format processing —
    otherwise the literal ``{{`` lands in the LLM output and trips JSON.parse.

    Calls ``.format()`` directly with empty-string values for any declared
    variables so the ``{{ }}`` → ``{ }`` collapse fires regardless of the
    render() no-kwarg short-circuit.
    """
    kwargs = {v: '' for v in tmpl.variables}
    rendered = tmpl.template.format(**kwargs)
    assert '{{' not in rendered, f'{tmpl.key} leaks {{{{ after format'
    assert '}}' not in rendered, f'{tmpl.key} leaks }}}} after format'


# ---------------------------------------------------------------------------
# Format-consumed templates — {{...}} escaping must collapse on render()
# ---------------------------------------------------------------------------


def test_flashcard_system_renders_clean_json() -> None:
    """FLASHCARD_GENERATION_SYSTEM uses {{ }} for JSON examples; render()
    must collapse them to single braces.
    """
    rendered = FLASHCARD_GENERATION_SYSTEM.render(count=5)
    assert '{{' not in rendered
    assert '}}' not in rendered
    assert '{"question"' in rendered  # JSON example with single braces


def test_mirror_system_passes_section_prompt_verbatim() -> None:
    """MIRROR_SYSTEM receives section_prompt as a value; braces inside the
    section prompt must survive as literal characters (not be interpreted
    as format placeholders).
    """
    section_with_braces = 'Return JSON: {"key": "value"}'
    rendered = MIRROR_SYSTEM.render(
        book_title='Test',
        book_author='Author',
        section_prompt=section_with_braces,
    )
    assert '{"key": "value"}' in rendered


def test_synthesis_human_renders_with_brace_in_title() -> None:
    """Regression: a book title containing a brace must not break rendering
    of SYNTHESIS_HUMAN, which is one of the call sites that previously used
    bare .format().
    """
    result = SYNTHESIS_HUMAN.render(
        title='{Special Edition}',
        author='Auth',
        data='payload',
    )
    assert '{Special Edition}' in result


# ---------------------------------------------------------------------------
# Variable validation in __post_init__
# ---------------------------------------------------------------------------


def test_post_init_rejects_declared_variable_missing_from_template() -> None:
    """A variable declared but absent from template raises ValueError."""
    with pytest.raises(ValueError, match='variables declared but not found'):
        PromptTemplate(
            key='bad.missing_var',
            version=1,
            template='Hi {name}',
            variables=['name', 'missing'],
        )


def test_post_init_rejects_placeholder_missing_from_variables() -> None:
    """A placeholder in template but not declared raises ValueError."""
    with pytest.raises(ValueError, match='placeholders in template but'):
        PromptTemplate(
            key='bad.missing_placeholder',
            version=1,
            template='Hi {name} {age}',
            variables=['name'],
        )


def test_post_init_skips_validation_when_variables_empty() -> None:
    """System prompts with literal JSON braces (no declared variables) must
    not trigger false-positive validation errors.
    """
    tmpl = PromptTemplate(
        key='sys.with_json',
        version=1,
        template='Return JSON: {"key": "value"} and [{{"id": 1}}]',
    )
    assert tmpl.template == 'Return JSON: {"key": "value"} and [{{"id": 1}}]'


def test_post_init_accepts_template_with_format_specs() -> None:
    """Placeholders with format specs (e.g. {name:>10}) validate correctly."""
    tmpl = PromptTemplate(
        key='ok.with_spec',
        version=1,
        template='{name:>10}',
        variables=['name'],
    )
    assert tmpl.variables == ['name']


# ---------------------------------------------------------------------------
# Conversation summary human template (v2 with preamble + conversation_text)
# ---------------------------------------------------------------------------


def test_conversation_summary_human_has_v2_placeholders() -> None:
    """CONVERSATION_SUMMARY_HUMAN was bumped to v2 with {preamble} and
    {conversation_text} placeholders so the consumer routes through render()
    instead of bare string concatenation.
    """
    assert CONVERSATION_SUMMARY_HUMAN.version == 2
    assert 'preamble' in CONVERSATION_SUMMARY_HUMAN.variables
    assert 'conversation_text' in CONVERSATION_SUMMARY_HUMAN.variables


def test_conversation_summary_human_renders_with_preamble() -> None:
    rendered = CONVERSATION_SUMMARY_HUMAN.render(
        preamble='New conversation to summarize:',
        conversation_text='User: hi\nAssistant: hello',
    )
    assert 'New conversation to summarize:' in rendered
    assert 'User: hi' in rendered


# ---------------------------------------------------------------------------
# Mirror section variable drift (P0.2)
# ---------------------------------------------------------------------------


def test_all_mirror_sections_declare_matching_variables() -> None:
    """All MIRROR_SECTIONS entries declare variables matching their placeholders."""
    from app.prompts.mirror_prompts import MIRROR_SECTIONS

    drift = []
    for key, tmpl in MIRROR_SECTIONS.items():
        actual = sorted(_extract_placeholders(tmpl.template))
        declared = sorted(tmpl.variables)
        if actual != declared:
            drift.append((key, actual, declared))
    assert not drift, f'Mirror section variable drift: {drift}'


def test_all_mirror_sections_have_sparse_data_guard() -> None:
    """P1.1: every Mirror section template contains the sparse-data guard."""
    from app.prompts.mirror_prompts import MIRROR_SECTIONS, SPARSE_DATA_GUARD

    missing = [
        k for k, t in MIRROR_SECTIONS.items()
        if SPARSE_DATA_GUARD[:50] not in t.template
    ]
    assert not missing, f'Sections missing sparse-data guard: {missing}'


def test_all_mirror_templates_have_temperature_and_max_tokens() -> None:
    """P1.2 + P1.5: every Mirror template has temperature=0.7 and max_tokens set."""
    from app.prompts.mirror_prompts import MIRROR_SECTIONS

    bad = []
    for k, t in MIRROR_SECTIONS.items():
        if t.temperature != 0.7 or t.max_tokens is None:
            bad.append((k, t.temperature, t.max_tokens))
    assert not bad, f'Mirror templates missing temp/max_tokens: {bad}'
    assert MIRROR_SYSTEM.temperature == 0.7
    assert MIRROR_SYSTEM.max_tokens is not None


def test_all_mirror_sections_share_current_version() -> None:
    """P1.4: all Mirror templates on v4 — system gained language-matching and
    every section bumped so the shared LLM cache key evicts stale entries."""
    from app.prompts.mirror_prompts import MIRROR_SECTIONS, MIRROR_SYSTEM

    section_versions = {t.version for t in MIRROR_SECTIONS.values()}
    assert section_versions == {4}, f'Mixed section versions: {section_versions}'
    assert MIRROR_SYSTEM.version == 4, 'system prompt must be v4 (language matching)'


# ---------------------------------------------------------------------------
# Structured-output templates have max_tokens (P1.2)
# ---------------------------------------------------------------------------


def test_all_structured_output_templates_have_max_tokens() -> None:
    """Every JSON / JSON-array template must declare max_tokens to prevent
    mid-JSON truncation."""
    import app.prompts as prompts

    no_max = []
    for name in dir(prompts):
        obj = getattr(prompts, name)
        templates_to_check: list = []
        if isinstance(obj, PromptTemplate):
            templates_to_check.append(obj)
        elif isinstance(obj, dict):
            templates_to_check.extend(
                v for v in obj.values() if isinstance(v, PromptTemplate)
            )
        for tmpl in templates_to_check:
            if tmpl.output_format in {'json', 'json_array'} and tmpl.max_tokens is None:
                no_max.append(f'{name} ({tmpl.key})')
    assert not no_max, f'Templates missing max_tokens: {no_max}'


# ---------------------------------------------------------------------------
# A3 — synthesis system templates embed the sparse-data guard
# ---------------------------------------------------------------------------


def test_all_synthesis_systems_have_sparse_data_guard() -> None:
    """A3: every synthesis system template embeds SYNTHESIS_SPARSE_GUARD.

    Without it, synthesis on a book with few highlights / no progress pads
    the output with generic literary-sounding analysis instead of admitting
    the data is thin. Mirror prompts have this guard (P1.1) — synthesis
    prompts were missing it.
    """
    from app.prompts.synthesis_prompts import SYNTHESIS_SPARSE_GUARD

    needle = SYNTHESIS_SPARSE_GUARD[:50]
    missing = [
        name for name, tmpl in (
            ('SYNTHESIS_SYSTEM', SYNTHESIS_SYSTEM),
            ('CROSS_BOOK_SYNTHESIS_SYSTEM', CROSS_BOOK_SYNTHESIS_SYSTEM),
            ('BOOK_COMPARE_SYSTEM', BOOK_COMPARE_SYSTEM),
        )
        if needle not in tmpl.template
    ]
    assert not missing, f'Synthesis system templates missing sparse guard: {missing}'


def test_synthesis_sparse_guard_distinct_from_mirror_guard() -> None:
    """The synthesis guard is intentionally not a copy of the mirror guard:
    synthesis produces thematic analysis at the book level, not per-section
    reader feedback. If someone collapses them by accident, this fires.
    """
    from app.prompts.synthesis_prompts import SYNTHESIS_SPARSE_GUARD
    from app.prompts.mirror_prompts import SPARSE_DATA_GUARD

    assert SYNTHESIS_SPARSE_GUARD != SPARSE_DATA_GUARD
    # Synthesis phrasing must call out books / themes; mirror talks about fields.
    assert 'book' in SYNTHESIS_SPARSE_GUARD.lower()
    assert 'themes or comparisons' in SYNTHESIS_SPARSE_GUARD.lower()


# ---------------------------------------------------------------------------
# A4 — synthesis human templates XML-wrap data blocks
# ---------------------------------------------------------------------------


def test_synthesis_human_template_xml_wraps_data() -> None:
    """A4: SYNTHESIS_HUMAN wraps {data} in <book_data>...</book_data>.

    Bare labeled text lets the model confuse the data block with the task
    framing when {data} itself contains prose-like fields. XML tags give a
    clear boundary.
    """
    rendered = SYNTHESIS_HUMAN.template.format(
        title='The Three-Body Problem', author='Liu Cixin',
        data='highlights: 0\nprogress: 5%',
    )
    assert '<book_data>' in rendered and '</book_data>' in rendered
    assert 'highlights: 0' in rendered  # data still present inside tags


def test_cross_book_synthesis_human_template_xml_wraps_data() -> None:
    """A4: CROSS_BOOK_SYNTHESIS_HUMAN wraps {data} in <books>...</books>."""
    from app.prompts import CROSS_BOOK_SYNTHESIS_HUMAN
    rendered = CROSS_BOOK_SYNTHESIS_HUMAN.template.format(data='book A: ...\nbook B: ...')
    assert '<books>' in rendered and '</books>' in rendered


def test_book_compare_human_template_xml_wraps_both_books() -> None:
    """A4: BOOK_COMPARE_HUMAN wraps each {data_N} in <book index="N">...</book>.

    Indexed tags let the model attribute themes to the right book even
    when both data blocks contain identical-looking fields.
    """
    from app.prompts import BOOK_COMPARE_HUMAN
    rendered = BOOK_COMPARE_HUMAN.template.format(
        title_1='A', author_1='X',
        title_2='B', author_2='Y',
        data_1='themes: love', data_2='themes: war',
    )
    assert '<book index="1">' in rendered and '<book index="2">' in rendered
    assert '</book>' in rendered
    assert 'themes: love' in rendered and 'themes: war' in rendered


def test_synthesis_human_templates_bumped_version() -> None:
    """A3+A4 version bump v1→v2 drives P0.4 cache key eviction.

    Stale cached synthesis outputs from v1 prompts would otherwise persist
    after deployment. The version field is the cache eviction signal.
    """
    from app.prompts import (
        BOOK_COMPARE_HUMAN, BOOK_COMPARE_SYSTEM,
        CROSS_BOOK_SYNTHESIS_HUMAN, CROSS_BOOK_SYNTHESIS_SYSTEM,
        SYNTHESIS_HUMAN, SYNTHESIS_SYSTEM,
    )
    for tmpl in (
        SYNTHESIS_SYSTEM, SYNTHESIS_HUMAN,
        CROSS_BOOK_SYNTHESIS_SYSTEM, CROSS_BOOK_SYNTHESIS_HUMAN,
        BOOK_COMPARE_SYSTEM, BOOK_COMPARE_HUMAN,
    ):
        assert tmpl.version >= 2, (
            f'{tmpl.key} still at v{tmpl.version} — bump to v2 to evict cache'
        )
