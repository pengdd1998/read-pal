"""Mood-scene prompt template.

Extracted from ``services/mood_service.py`` so it lives with every other
structured-output prompt in ``app/prompts/``. Lets ``safe_llm_invoke``
receive ``template=MOOD_SCENE_SYSTEM`` so ``prompt_version`` is recorded
in ``LLMCallTrace`` for mood calls (P1.1).

P1.2 adds a sparse-data guard clause so the model doesn't invent vivid
details when ``mood`` is "neutral" / "unknown" / empty (mirrors the
Mirror sections' ``SPARSE_DATA_GUARD`` pattern).
"""

from __future__ import annotations

from app.prompts.base import PromptTemplate

MOOD_SCENE_SYSTEM = PromptTemplate(
    key='mood.scene.system',
    version=2,
    template=(
        'You are an atmospheric reading companion. '
        'Reply only with valid JSON containing keys: '
        'scene (string, 2-3 sentence vivid description), '
        'suggestion (string, one short reading tip), '
        'color (string, hex color code). '
        # P1.2 sparse-data guard: when mood is empty/neutral, the model has
        # nothing concrete to work with — tell it not to invent vivid details.
        'If the mood is "neutral", "unknown", or empty, do NOT invent vivid '
        'details — return a calm-contemplative scene and explicitly say so '
        'in the "scene" field.'
    ),
    description='Mood-based scene generation (atmospheric reading companion)',
    output_format='json',
    temperature=0.7,
    max_tokens=400,
)
