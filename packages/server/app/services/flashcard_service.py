"""Flashcard business logic — SM-2 spaced repetition algorithm.

Re-exports from the flashcard package for backward compatibility.
"""

from app.services.flashcard import (  # noqa: F401
    DEFAULT_EASE_FACTOR,
    MIN_EASE_FACTOR,
    count_reviewed,
    count_total,
    create_flashcard,
    generate_flashcards,
    get_due_cards,
    list_decks,
    list_flashcards,
    review_flashcard,
    sm2_schedule,
)

__all__ = [
    'DEFAULT_EASE_FACTOR',
    'MIN_EASE_FACTOR',
    'count_reviewed',
    'count_total',
    'create_flashcard',
    'generate_flashcards',
    'get_due_cards',
    'list_decks',
    'list_flashcards',
    'review_flashcard',
    'sm2_schedule',
]
