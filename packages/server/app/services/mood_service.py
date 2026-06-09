"""Mood scene service — generate mood-based reading atmospheres via LLM."""

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.llm import safe_llm_call

logger = logging.getLogger('read-pal.mood')

_SYSTEM_PROMPT = (
    'You are an atmospheric reading companion. '
    'Reply only with valid JSON containing keys: '
    'scene (string, 2-3 sentence vivid description), '
    'suggestion (string, one short reading tip), '
    'color (string, hex color code).'
)


def _build_fallback(mood: str) -> dict:
    return {
        'mood': mood,
        'scene': f'A calm, {mood} reading atmosphere.',
        'suggestion': 'Take a moment to settle in before you start reading.',
        'color': '#4A90D9',
    }


def _parse_response(raw: str, mood: str) -> dict:
    """Parse LLM response, stripping markdown fences if present."""
    fallback = _build_fallback(mood)
    text = raw.strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
    parsed = json.loads(text)
    return {
        'mood': mood,
        'scene': parsed.get('scene', fallback['scene']),
        'suggestion': parsed.get('suggestion', fallback['suggestion']),
        'color': parsed.get('color', fallback['color']),
    }


async def generate_mood_scene(
    db: AsyncSession,  # noqa: ARG001 — kept for interface consistency
    user_id: str,  # noqa: ARG001 — kept for interface consistency
    mood: str,
    text: str | None = None,
    lang: str = 'en',
) -> dict:
    """Generate a mood-based scene description using the LLM."""
    if not mood or mood == 'neutral':
        if text:
            mood = 'contemplative'

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=(
            f'The reader is in a "{mood}" mood. '
            f'Generate a mood-based reading scene. '
            f'Use language code: {lang}.'
        )),
    ]

    fallback = _build_fallback(mood)

    try:
        raw = await safe_llm_call(messages, fallback='', log_label='mood-scene')
    except (ValueError, RuntimeError, ConnectionError) as exc:
        logger.warning('Mood scene LLM call failed, using fallback: %s', exc)
        return fallback

    if not raw:
        return fallback

    try:
        return _parse_response(raw, mood)
    except (json.JSONDecodeError, KeyError):
        logger.warning('mood.parse_failed raw_preview=%s', raw[:100] if raw else None)
        return fallback
