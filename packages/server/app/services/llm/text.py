"""Text helpers for LLM output processing."""

from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger('read-pal.llm')


def _strip_markdown_fences(content: str) -> str:
    """Strip ```json ... ``` and ``` ... ``` wrappers from LLM output."""
    stripped = content.strip()
    if not stripped.startswith('```'):
        return content
    lines = stripped.split('\n')
    # First line is ```json or ``` — skip it
    # Last line is ``` — skip it
    if len(lines) >= 2 and lines[-1].strip() == '```':
        return '\n'.join(lines[1:-1])
    return content


def _validate_parsed(
    data: Any,
    schema_class: type,
    log_label: str,
) -> Any:
    """Validate parsed JSON against a Pydantic schema.

    Returns validated data on success, raw data on validation failure.
    """
    try:
        result = schema_class.model_validate(data)
        return result.model_dump()
    except (ValueError, TypeError) as exc:
        logger.warning(
            'llm_schema_validation_failed',
            label=log_label,
            error=str(exc),
        )
        return data
