"""Centralized, versioned prompt templates for all LLM interactions.

Every prompt sent to an LLM should come from this module, not be
hardcoded in service files. Each prompt has a version number for
tracking changes and enabling future a/b testing.
"""

from __future__ import annotations

from app.prompts.base import PromptTemplate  # noqa: F401 — re-exported
from app.prompts.companion_prompts import (
    FRIEND_BOOK_CONTEXT,
    FRIEND_PERSONAS,
)
from app.prompts.mirror_prompts import (
    MEMORY_BOOK_CHAPTERS,
    MEMORY_BOOK_SYSTEM,
    MIRROR_SECTIONS,
    MIRROR_SYSTEM,
)
from app.prompts.mood_prompts import MOOD_SCENE_SYSTEM
from app.prompts.study_prompts import (
    FLASHCARD_GENERATION_HUMAN,
    FLASHCARD_GENERATION_SYSTEM,
    KNOWLEDGE_EXTRACTION_HUMAN,
    KNOWLEDGE_EXTRACTION_SYSTEM,
    STUDY_CONCEPT_CHECKS_HUMAN,
    STUDY_CONCEPT_CHECKS_SYSTEM,
    STUDY_OBJECTIVES_HUMAN,
    STUDY_OBJECTIVES_SYSTEM,
)
from app.prompts.synthesis_prompts import (
    BOOK_COMPARE_HUMAN,
    BOOK_COMPARE_SYSTEM,
    CONVERSATION_SUMMARY_HUMAN,
    CONVERSATION_SUMMARY_SYSTEM,
    CROSS_BOOK_SYNTHESIS_HUMAN,
    CROSS_BOOK_SYNTHESIS_SYSTEM,
    READING_PLAN_HUMAN,
    READING_PLAN_SYSTEM,
    SYNTHESIS_HUMAN,
    SYNTHESIS_SYSTEM,
)

__all__ = [
    'ALL_TEMPLATES',
    'PromptTemplate',
    'BOOK_COMPARE_HUMAN',
    'BOOK_COMPARE_SYSTEM',
    'CONVERSATION_SUMMARY_HUMAN',
    'CONVERSATION_SUMMARY_SYSTEM',
    'CROSS_BOOK_SYNTHESIS_HUMAN',
    'CROSS_BOOK_SYNTHESIS_SYSTEM',
    'FLASHCARD_GENERATION_HUMAN',
    'FLASHCARD_GENERATION_SYSTEM',
    'FRIEND_BOOK_CONTEXT',
    'FRIEND_PERSONAS',
    'KNOWLEDGE_EXTRACTION_HUMAN',
    'KNOWLEDGE_EXTRACTION_SYSTEM',
    'MEMORY_BOOK_CHAPTERS',
    'MEMORY_BOOK_SYSTEM',
    'MIRROR_SECTIONS',
    'MIRROR_SYSTEM',
    'MOOD_SCENE_SYSTEM',
    'READING_PLAN_HUMAN',
    'READING_PLAN_SYSTEM',
    'STUDY_CONCEPT_CHECKS_HUMAN',
    'STUDY_CONCEPT_CHECKS_SYSTEM',
    'STUDY_OBJECTIVES_HUMAN',
    'STUDY_OBJECTIVES_SYSTEM',
    'SYNTHESIS_HUMAN',
    'SYNTHESIS_SYSTEM',
]



# ---------------------------------------------------------------------------
# Registry for lookup
# ---------------------------------------------------------------------------

ALL_TEMPLATES: dict[str, PromptTemplate] = {}


def _build_registry() -> None:
    """Build the lookup registry from all template collections."""
    collections: list[dict[str, PromptTemplate] | dict[int, PromptTemplate]] = [
        FRIEND_PERSONAS,
        MEMORY_BOOK_CHAPTERS,  # type: ignore[dict-item]
        MIRROR_SECTIONS,  # type: ignore[dict-item]
    ]
    singles: list[PromptTemplate] = [
        FRIEND_BOOK_CONTEXT,
        FLASHCARD_GENERATION_SYSTEM,
        FLASHCARD_GENERATION_HUMAN,
        STUDY_OBJECTIVES_SYSTEM,
        STUDY_OBJECTIVES_HUMAN,
        STUDY_CONCEPT_CHECKS_SYSTEM,
        STUDY_CONCEPT_CHECKS_HUMAN,
        KNOWLEDGE_EXTRACTION_SYSTEM,
        KNOWLEDGE_EXTRACTION_HUMAN,
        MEMORY_BOOK_SYSTEM,
        MIRROR_SYSTEM,
        MOOD_SCENE_SYSTEM,
        SYNTHESIS_SYSTEM,
        SYNTHESIS_HUMAN,
        CROSS_BOOK_SYNTHESIS_SYSTEM,
        CROSS_BOOK_SYNTHESIS_HUMAN,
        BOOK_COMPARE_SYSTEM,
        BOOK_COMPARE_HUMAN,
        READING_PLAN_SYSTEM,
        READING_PLAN_HUMAN,
        CONVERSATION_SUMMARY_SYSTEM,
        CONVERSATION_SUMMARY_HUMAN,
    ]

    for coll in collections:
        for _k, tmpl in coll.items():
            ALL_TEMPLATES[tmpl.key] = tmpl

    for tmpl in singles:
        ALL_TEMPLATES[tmpl.key] = tmpl


_build_registry()
