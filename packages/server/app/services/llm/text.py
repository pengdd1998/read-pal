"""Text helpers for LLM output processing."""

from __future__ import annotations

import json
import re
from typing import Any

import structlog

logger = structlog.get_logger('read-pal.llm')

# Matches a fenced block: opening ``` (optionally with a language tag like json),
# content (incl. newlines), closing ```. Tolerates leading/trailing prose around
# the fence (e.g. "Here is the JSON:\n```json\n{...}\n```\nLet me know!").
_FENCE_RE = re.compile(r'```(?:[a-zA-Z0-9_+-]*)?\s*\n?(.*?)```', re.DOTALL)

# Trailing commas before a closing brace/bracket — common LLM mistake that
# strict JSON rejects but Python's dict/list literals allow. Only matches
# commas NOT inside string literals (best-effort; nested-quote edge cases
# may slip through but those are rarer than trailing commas).
_TRAILING_COMMA_RE = re.compile(r',(\s*[}\]])')


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


def _extract_balanced_json(content: str) -> str | None:
    """Extract the outermost balanced {...} or [...] substring.

    LLMs sometimes prepend "Sure, here's the JSON:" or append trailing
    commentary that breaks strict ``json.loads``. This finds the first
    ``{`` or ``[``, walks the string respecting string-literal state,
    and returns the slice up to the matching close. Returns None when no
    balanced structure is found.

    Single-pass O(n) scan; skips characters inside string literals so
    braces inside strings (e.g. ``"pattern": "\\d{3}"``) don't fool it.
    """
    start = -1
    open_ch = ''
    close_ch = ''
    for i, ch in enumerate(content):
        if ch in '{[':
            start = i
            open_ch = ch
            close_ch = '}' if ch == '{' else ']'
            break
    if start < 0:
        return None

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(content)):
        ch = content[i]
        if escape:
            escape = False
            continue
        if ch == '\\' and in_string:
            escape = True
            continue
        if ch == '"' and not escape:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return content[start:i + 1]
    return None


def _repair_json(content: str, log_label: str = 'LLM') -> tuple[Any, str | None]:
    """Multi-stage JSON repair ladder.

    Returns ``(parsed, stage_name)`` on success or ``(None, None)`` if every
    stage failed. Stages run in increasing aggressiveness:

    1. ``strict`` — bare ``json.loads`` on the cleaned content.
    2. ``extract_balanced`` — find the outermost {...} or [...] (handles
       leading/trailing prose without fences).
    3. ``strip_trailing_commas`` — remove trailing commas Python allows
       but strict JSON rejects.

    Each stage logs the failure path so we can see in production which
    repair class is most common.
    """
    cleaned = _strip_markdown_fences(content)

    # Stage 1: strict parse
    try:
        return json.loads(cleaned), 'strict'
    except json.JSONDecodeError:
        pass

    # Stage 2: extract balanced JSON (handles "Here's the JSON: {...}" prose)
    extracted = _extract_balanced_json(cleaned)
    if extracted is not None and extracted != cleaned:
        try:
            return json.loads(extracted), 'extract_balanced'
        except json.JSONDecodeError:
            pass

    # Stage 3: strip trailing commas (Python allows, strict JSON doesn't)
    if _TRAILING_COMMA_RE.search(cleaned):
        stripped_commas = _TRAILING_COMMA_RE.sub(r'\1', cleaned)
        try:
            return json.loads(stripped_commas), 'strip_trailing_commas'
        except json.JSONDecodeError:
            pass
        # Stage 3b: combine extract + comma strip
        if extracted is not None:
            try:
                stripped_extract = _TRAILING_COMMA_RE.sub(r'\1', extracted)
                return json.loads(stripped_extract), 'extract_and_strip_commas'
            except json.JSONDecodeError:
                pass

    logger.warning(
        'llm_json_repair_exhausted',
        label=log_label,
        content_preview=cleaned[:200],
    )
    return None, None


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
