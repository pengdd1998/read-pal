"""Backward-compatibility shim — all exports moved to app.services.study_mode package."""

from app.services.study_mode import (  # noqa: F401
    _extract_items,
    _generic_checks,
    _generic_objectives,
    generate_concept_checks,
    generate_objectives,
    get_mastery,
    save_checks_as_flashcards,
)
