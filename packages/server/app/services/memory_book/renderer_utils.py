"""Shared HTML escaping utility for Reading Mirror renderers."""

from __future__ import annotations


def _esc(text: str) -> str:
    """Escape text for safe HTML embedding."""
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
