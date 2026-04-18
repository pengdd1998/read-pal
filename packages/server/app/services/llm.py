"""LLM service — thin wrapper around langchain-openai for GLM."""

import logging

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
    )
