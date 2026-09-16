"""P2.6 tests: genre modifier consistency and expanded coverage.

Validates that:
- GENRE_MODIFIERS keys stay in sync with the Pydantic Literal args
  (with 'default' allowed as the intentional no-op exception)
- Each new genre (poetry, biography, history, philosophy) renders correctly
- Dead imports (_RAG_PARAMS, _GENRE_MODIFIERS) are gone from context.py

The Literal can't be derived at type-check time (Literal requires literal
strings), so this test asserts sync. If a future PR adds a genre to one
place but not the other, this test fails before merge — same pattern as
P2.1's persona consistency check.
"""

from __future__ import annotations

import typing

from app.schemas.agent import ChatRequest, RegenerateRequest
from app.services.companion import context as companion_context
from app.services.companion.context_prompts import GENRE_MODIFIERS


def _genre_literal_args() -> set[str]:
    """Pull Literal args from the ChatRequest.genre annotation.

    Both ChatRequest and RegenerateRequest carry the same Literal; we
    verify they agree and return the canonical set.
    """
    chat_args = _extract_literal(ChatRequest.__annotations__['genre'])
    regen_args = _extract_literal(RegenerateRequest.__annotations__['genre'])
    assert chat_args == regen_args, (
        f'ChatRequest.genre Literal {chat_args} != RegenerateRequest.genre Literal {regen_args}; '
        f'these must stay in sync.'
    )
    return chat_args


def _extract_literal(field_type: object) -> set[str]:
    """Unwrap Optional[Literal[...]] and return the Literal's arg set."""
    args = typing.get_args(field_type)
    for arg in args:
        if typing.get_origin(arg) is typing.Literal:
            return set(typing.get_args(arg))
    raise AssertionError(f'annotation is not Literal[...] | None: {field_type!r}')


def test_every_literal_genre_has_a_modifier_except_default():
    """All Literal genres except 'default' must have a GENRE_MODIFIERS entry.

    'default' is the intentional no-op: it means "no genre-specific
    guidance". Every other Literal value must have a corresponding
    modifier or the router silently degrades to generic prompting.
    """
    literal_genres = _genre_literal_args()
    modifier_genres = set(GENRE_MODIFIERS.keys())

    missing = literal_genres - modifier_genres - {'default'}
    assert not missing, (
        f'Literal genres {missing} have no GENRE_MODIFIERS entry; '
        f'the router will silently no-op when these are sent.'
    )


def test_no_modifier_keys_outside_literal():
    """No GENRE_MODIFIERS key should exist outside the Literal enum.

    Catches the inverse drift: adding a modifier that the router can't
    accept because the schema rejects it.
    """
    literal_genres = _genre_literal_args()
    modifier_genres = set(GENRE_MODIFIERS.keys())

    extra = modifier_genres - literal_genres
    assert not extra, (
        f'GENRE_MODIFIERS has keys {extra} not in the Literal enum; '
        f'these can never be selected by a client.'
    )


def test_default_is_intentionally_absent():
    """'default' must NOT have a modifier — it's the explicit no-op."""
    assert 'default' not in GENRE_MODIFIERS, (
        "'default' should be the no-op signal; adding a modifier for it "
        'would double-apply generic guidance.'
    )


def test_expanded_genres_are_present():
    """P2.6 expansion: poetry, biography, history, philosophy must be available."""
    expected = {'poetry', 'biography', 'history', 'philosophy'}
    actual = set(GENRE_MODIFIERS.keys())
    missing = expected - actual
    assert not missing, (
        f'P2.6 expansion genres missing: {missing}'
    )


def test_each_modifier_mentions_the_genre():
    """Defense against copy-paste mistakes — modifier text references its genre."""
    for genre, modifier in GENRE_MODIFIERS.items():
        # The modifier text should mention the genre name (case-insensitive).
        # Fiction's modifier says "fiction book", nonfiction's says "non-fiction book", etc.
        genre_words = {
            'nonfiction': ['non-fiction', 'nonfiction'],
            'fiction': ['fiction'],
            'technical': ['technical'],
            'academic': ['academic'],
            'poetry': ['poetry'],
            'biography': ['biography', 'memoir'],
            'history': ['history'],
            'philosophy': ['philosophy'],
        }
        words = genre_words.get(genre, [genre])
        lower = modifier.lower()
        assert any(w in lower for w in words), (
            f'genre modifier for {genre!r} does not mention the genre name'
        )


def test_each_modifier_has_focus_structure():
    """Every modifier should give the model concrete focus areas.

    Catches vague modifiers like 'Discuss this genre thoughtfully' that
    provide no actionable guidance.
    """
    for genre, modifier in GENRE_MODIFIERS.items():
        # Each modifier should have at least 3 bullet points (focus areas)
        bullet_count = modifier.count('\n- ')
        assert bullet_count >= 3, (
            f'genre modifier for {genre!r} has only {bullet_count} focus areas; '
            f'expected at least 3 concrete bullets'
        )


def test_dead_imports_removed_from_context_module():
    """P2.6 cleanup: _RAG_PARAMS and _GENRE_MODIFIERS were unused re-exports."""
    import inspect
    src = inspect.getsource(companion_context)
    assert '_RAG_PARAMS' not in src, (
        '_RAG_PARAMS still imported in context.py — was dead code, should be removed'
    )
    assert '_GENRE_MODIFIERS' not in src, (
        '_GENRE_MODIFIERS still imported in context.py — was dead code, should be removed'
    )
