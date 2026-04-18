"""Shared annotation helpers — type matching and value normalization."""

from __future__ import annotations

from typing import Any

from app.models.annotation import AnnotationType


def match_annotation_type(value: Any, target: AnnotationType) -> bool:
    """Compare annotation type — works with both enum members and strings."""
    if hasattr(value, 'value'):
        return value == target or value.value == target.value
    return value == target.value


def annotation_type_value(raw: Any) -> str:
    """Normalize an annotation type to its string value."""
    if hasattr(raw, 'value'):
        return raw.value
    return str(raw)
