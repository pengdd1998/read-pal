"""Shared annotation formatting utilities."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.annotation import Annotation


def format_annotation_entry(ann: Annotation) -> str:
    """Format a single annotation into a labeled context string."""
    label = ann.type.value if hasattr(ann.type, 'value') else str(ann.type)
    entry = f'[{label}] {ann.content}'
    if ann.note:
        entry += f' (note: {ann.note})'
    return entry
