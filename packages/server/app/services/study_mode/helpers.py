"""Study mode helpers — fallback generators and LLM result extraction."""

from __future__ import annotations

import uuid
from typing import Any


def _generic_objectives(chapter_title: str) -> list[dict[str, Any]]:
    """Fallback objectives when LLM is unavailable."""
    return [
        {'id': str(uuid.uuid4()), 'text': f'Understand the key themes of "{chapter_title}"', 'completed': False},
        {'id': str(uuid.uuid4()), 'text': f'Identify the main ideas presented in "{chapter_title}"', 'completed': False},
        {'id': str(uuid.uuid4()), 'text': f'Summarize the key takeaways from "{chapter_title}"', 'completed': False},
    ]


def _generic_checks(chapter_title: str) -> list[dict[str, Any]]:
    """Fallback concept checks when LLM is unavailable."""
    positions = ['start', 'middle', 'end']
    return [
        {
            'id': str(uuid.uuid4()),
            'question': f'What is the central idea of "{chapter_title}"?',
            'hint': 'Think about the main argument or theme.',
            'answer': 'The central idea revolves around the key themes discussed in this chapter.',
            'position': positions[i % 3],
        }
        for i in range(3)
    ]


def _extract_items(result: Any, wrapper_key: str) -> list[dict[str, Any]]:
    """Extract a list of items from LLM result, handling both wrapped and bare lists.

    The LLM may return either:
    - A bare list: [{...}, {...}]
    - A wrapped dict: {"objectives": [{...}]} or {"checks": [{...}]}
    """
    if isinstance(result, list):
        items = result
    elif isinstance(result, dict):
        # Try the expected wrapper key first, then fall back to any list value
        items = result.get(wrapper_key)
        # Only fallback if the key is missing entirely, not if it's an empty list
        if items is None:
            for value in result.values():
                if isinstance(value, list) and value:
                    items = value
                    break
            else:
                items = []
        elif not isinstance(items, list):
            items = []
    else:
        return []

    # Ensure each item is a dict with an id
    clean: list[dict[str, Any]] = []
    for item in items[:5]:
        if not isinstance(item, dict):
            continue
        if 'id' not in item or not item['id']:
            item['id'] = str(uuid.uuid4())
        clean.append(item)
    return clean
