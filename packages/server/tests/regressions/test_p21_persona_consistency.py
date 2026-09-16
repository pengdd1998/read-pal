"""P2.1 tests: persona definitions stay in sync across modules.

The persona set is referenced in three places:
1. ``FRIEND_PERSONAS`` dict in ``companion_prompts.py`` (canonical source)
2. ``VALID_PERSONAS`` tuple in ``models/friend.py`` (DB-layer validation)
3. ``Literal[...]`` type in ``schemas/agent.py`` (Pydantic request validation)

P2.1 made ``VALID_PERSONAS`` derive from ``FRIEND_PERSONAS.keys()`` so the
DB layer can't drift. The ``Literal`` can't be derived at type-check time
(Literal requires literal strings), so this test asserts the ``Literal``
args match ``VALID_PERSONAS``. If a future PR adds a persona to one place
but not the others, this test fails before merge.
"""

from __future__ import annotations

import typing

from app.models.friend import VALID_PERSONAS
from app.prompts.companion_prompts import FRIEND_PERSONAS
from app.schemas.agent import FriendChatRequest


def test_valid_personas_derived_from_friend_personas() -> None:
    """VALID_PERSONAS is exactly FRIEND_PERSONAS.keys() — no drift."""
    assert set(VALID_PERSONAS) == set(FRIEND_PERSONAS.keys())


def test_literal_matches_valid_personas() -> None:
    """The Pydantic Literal type stays in sync with VALID_PERSONAS.

    Pydantic exposes ``Literal`` args via ``__annotations__``. We pull
    them out and compare as sets so order doesn't matter.
    """
    field_type = FriendChatRequest.__annotations__['persona']
    literal_args = set(typing.get_args(field_type))
    assert literal_args == set(VALID_PERSONAS), (
        f'Literal personas {literal_args} != VALID_PERSONAS {set(VALID_PERSONAS)}; '
        f'update schemas/agent.py:FriendChatRequest.persona to match.'
    )


def test_each_persona_has_a_template() -> None:
    """Every VALID_PERSONAS entry has a corresponding FRIEND_PERSONAS template."""
    for persona in VALID_PERSONAS:
        assert persona in FRIEND_PERSONAS, (
            f'persona {persona!r} missing from FRIEND_PERSONAS templates'
        )
