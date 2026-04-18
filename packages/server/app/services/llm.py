"""LLM service — thin wrapper around langchain-openai for GLM."""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI

from app.config import get_settings

logger = logging.getLogger('read-pal.llm')


def get_llm(temperature: float = 0.7, max_tokens: int = 2000) -> ChatOpenAI:
    """Return a ChatOpenAI instance configured for GLM.

    A new instance is created per call so that temperature and max_tokens
    can be customised per-endpoint (e.g. lower temperature for summaries).
    """
    settings = get_settings()
    return ChatOpenAI(
        model=settings.default_model,
        api_key=settings.glm_api_key,
        base_url=settings.glm_base_url,
        temperature=temperature,
        max_tokens=max_tokens,
        max_retries=3,
    )


async def safe_llm_invoke(
    messages: list[BaseMessage],
    *,
    fallback: Any = None,
    log_label: str = 'LLM',
) -> Any:
    """Invoke LLM with standard error handling and JSON parsing.

    Returns parsed JSON, stripped markdown fences, or *fallback* on failure.
    """
    llm = get_llm()
    try:
        response = await llm.ainvoke(messages)
    except Exception as exc:
        logger.error('%s call failed: %s', log_label, exc)
        return fallback

    content = response.content.strip()
    if content.startswith('```'):
        lines = content.split('\n')
        content = '\n'.join(lines[1:-1])

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.warning('Failed to parse %s response', log_label)
        return fallback
