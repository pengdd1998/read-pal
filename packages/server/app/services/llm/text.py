"""Text helpers for LLM output processing."""

from __future__ import annotations

import re
from typing import Any

import structlog

logger = structlog.get_logger('read-pal.llm')

# Matches a fenced block: opening ``` (optionally with a language tag like json),
# content (incl. newlines), closing ```. Tolerates leading/trailing prose around
# the fence (e.g. "Here is the JSON:\n```json\n{...}\n```\nLet me know!").
_FENCE_RE = re.compile(r'```(?:[a-zA-Z0-9_+-]*)?\s*\n?(.*?)```', re.DOTALL)


def _strip_markdown_fences(content: str) -> str:
    """Strip ```json ... ``` (and variants) wrappers from LLM output.

    Tolerates leading prose before the fence, trailing prose after it, and a
    language tag on the opening fence. If no fence is present the content is
    returned unchanged (stripped of surrounding whitespace).
    """
    stripped = content.strip()
    match = _FENCE_RE.search(stripped)
    if match:
        return match.group(1).strip()
    return stripped


def _validate_parsed(
    data: Any,
    schema_class: type,
    log_label: str,
    fallback: Any = None,
) -> Any:
    """Validate parsed JSON against a Pydantic schema.

    Returns the validated, model-dumped data on success; returns ``fallback`` on
    validation failure so callers never receive a raw dict that violates the
    schema (which would pollute downstream consumers expecting the schema shape).
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
        return fallback
