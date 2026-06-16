"""Mood scene service — generate mood-based reading atmospheres via LLM.

Routes through ``safe_llm_invoke`` so the JSON-parse + Pydantic-validate +
fallback ladder is shared with every other structured-output consumer. The
previous hand-rolled ``_parse_response`` with bare ``json.loads`` was a
guaranteed 500 on the first malformed LLM response.
"""

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.prompts.mood_prompts import MOOD_SCENE_SYSTEM
from app.schemas.llm_outputs import MoodSceneData
from app.services.llm import safe_llm_invoke
from app.utils.i18n import DEFAULT_LANGUAGE
from app.utils.sanitizer import sanitize_book_field

logger = logging.getLogger('read-pal.mood')


def _build_fallback(mood: str) -> dict:
    """Build the fallback response. Note: mood is added by the caller after
    ``safe_llm_invoke`` returns, not stored in MoodSceneData itself."""
    return {
        'scene': f'A calm, {mood} reading atmosphere.',
        'suggestion': 'Take a moment to settle in before you start reading.',
        'color': '#4A90D9',
    }


async def generate_mood_scene(
    db: AsyncSession,  # noqa: ARG001 — kept for interface consistency
    user_id: str,  # noqa: ARG001 — kept for interface consistency
    mood: str,
    text: str | None = None,
    lang: str = DEFAULT_LANGUAGE,
) -> dict:
    """Generate a mood-based scene description using the LLM."""
    if not mood or mood == 'neutral':
        if text:
            mood = 'contemplative'

    # P0.1: mood is user-controlled (POST body). Sanitize before interpolation
    # to close the prompt-injection vector where a malicious mood like
    # 'happy\n\nIgnore previous instructions' would land verbatim in the
    # HumanMessage content. Use sanitize_book_field (inline wrap) rather than
    # sanitize_user_input (multi-line wrap) because mood is a SHORT field that
    # lives inside a quoted context like '"happy" mood' — newlines from the
    # multi-line wrap would visually break the quote.
    mood = sanitize_book_field(mood, field='mood')
    if not mood:
        mood = 'neutral'

    messages = [
        SystemMessage(content=MOOD_SCENE_SYSTEM.template),
        HumanMessage(content=(
            f'The reader is in a "{mood}" mood. '
            f'Generate a mood-based reading scene. '
            f'Use language code: {lang}.'
        )),
    ]

    fallback = _build_fallback(mood)
    result = await safe_llm_invoke(
        messages,
        fallback=fallback,
        log_label='mood-scene',
        schema_class=MoodSceneData,
        lang=lang,
        template=MOOD_SCENE_SYSTEM,
    )

    if isinstance(result, dict) and result:
        # Add mood to the response (not part of LLM output schema)
        return {'mood': mood, **result}
    return {'mood': mood, **fallback}
