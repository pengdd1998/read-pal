"""Shared annotation formatting utilities."""


def format_annotation_entry(ann) -> str:
    """Format a single annotation into a labeled context string."""
    label = ann.type.value if hasattr(ann.type, 'value') else str(ann.type)
    entry = f'[{label}] {ann.content}'
    if ann.note:
        entry += f' (note: {ann.note})'
    return entry
