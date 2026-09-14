"""Planner-output protocol — strict, forgiving parser.

The planning call returns a JSON object shaped
``{"tools": [{"name": "...", "args": {...}}]}``. Models wrap it in
prose or fences; the parser extracts the first plausible object and
validates defensively. Anything off → empty list (degrade to no-tools),
never an exception.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.rag._constants import logger

_JSON_BLOCK_RE = re.compile(r'\{.*\}', re.DOTALL)


def parse_tool_plan(raw: str | None, max_tools: int = 2) -> list[dict[str, Any]]:
    """Parse planner output into ``[{'name': ..., 'args': {...}}]``.

    Rules: first JSON object wins; unknown tool names dropped; more than
    ``max_tools`` calls truncated (in order); missing args → ``{}``.
    Returns ``[]`` for anything unparseable — the caller treats that as
    "answer directly".
    """
    if not raw or not raw.strip():
        return []
    candidate = raw.strip()
    # Strip a ```json fence if present.
    fence = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', candidate, re.DOTALL)
    if fence:
        candidate = fence.group(1)
    else:
        block = _JSON_BLOCK_RE.search(candidate)
        if block:
            candidate = block.group(0)

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        logger.info('companion.tool_plan_unparseable len=%d', len(raw))
        return []
    if not isinstance(parsed, dict):
        return []

    # Accept both {"tools": [...]} and a bare list-shaped value.
    calls = parsed.get('tools')
    if not isinstance(calls, list):
        return []

    from app.services.companion.tools.registry import TOOL_SPECS

    out: list[dict[str, Any]] = []
    for call in calls:
        if not isinstance(call, dict):
            continue
        name = call.get('name')
        if not isinstance(name, str) or name not in TOOL_SPECS:
            logger.info('companion.tool_plan_unknown_tool name=%s', name)
            continue
        args = call.get('args')
        if not isinstance(args, dict):
            args = {}
        out.append({'name': name, 'args': args})
        if len(out) >= max_tools:
            break
    return out
