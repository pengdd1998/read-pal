"""Flashcard service package — SM-2 spaced repetition and LLM generation.

Re-exports all public symbols so existing imports continue to work.
"""

from app.services.flashcard.generation import generate_flashcards
from app.services.flashcard.sm2 import (
    DEFAULT_EASE_FACTOR,
    MIN_EASE_FACTOR,
    count_total,
    create_flashcard,
    get_due_cards,
    list_decks,
    list_flashcards,
    review_flashcard,
    sm2_schedule,
)

__all__ = [
    'DEFAULT_EASE_FACTOR',
    'MIN_EASE_FACTOR',
    'count_total',
    'create_flashcard',
    'generate_flashcards',
    'get_due_cards',
    'list_decks',
    'list_flashcards',
    'review_flashcard',
    'sm2_schedule',
]
