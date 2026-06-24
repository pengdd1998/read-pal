"""Token budgeting for LLM prompts.

Estimates token counts and enforces budgets to prevent oversized prompts
from exceeding model context windows.

Phase 4A of the harness-engineering rollout: model context windows are now
keyed by provider family, not by exact model name. This fixes the silent
wrong-window estimate when a non-GLM fallback provider (DeepSeek, GPT-4.1)
is selected. See ``docs/incidents/p0-incident-cluster.md`` for the
related fallback-chain incident.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger('read-pal.token_budget')

# ---------------------------------------------------------------------------
# Provider-family context windows (Phase 4A — M4)
# ---------------------------------------------------------------------------
# Each provider family has its own context window. The lookup matches on
# substrings in the lowercased model name (e.g. 'glm' matches 'glm-4-flash',
# 'gpt' matches 'gpt-4.1-nano', 'deepseek' matches 'deepseek-chat').
# Unknown models fall back to a conservative default and emit a warning so
# they're visible in observability -- better to under-budget than over-budget.
#
# When a new provider is onboarded, add its prefix here. When a model
# within an existing family changes window (rare), update the family entry.
PROVIDER_CONTEXT_WINDOWS: dict[str, int] = {
    'glm': 128_000,        # GLM-4, GLM-4-flash, GLM-4.7-flash
    'gpt': 128_000,        # GPT-4.1, GPT-4.1-nano, GPT-4o, GPT-5
    'deepseek': 64_000,    # DeepSeek-chat, DeepSeek-coder
    'claude': 200_000,     # Claude Opus/Sonnet/Haiku (in case of future routing)
    'embedding': 8_000,    # embedding-3 and similar
}

# Fallback for unrecognized models -- intentionally conservative.
DEFAULT_CONTEXT_WINDOW = 32_000

# Per-model overrides (when a specific model within a family has a different
# window than the family default). Keep this small -- prefer family entries.
MODEL_CONTEXT_WINDOWS: dict[str, int] = {
    # Backward-compat: callers that passed exact GLM model names still work.
    'glm-4.7-flash': 128_000,
    'glm-4-flash': 128_000,
    'glm-4': 128_000,
    'embedding-3': 8_000,
}


def context_window_for(model: str | None) -> tuple[str, int]:
    """Return ``(provider_family, window_size)`` for ``model``.

    Logs a warning when the model is unrecognized so silent wrong-window
    estimates are visible in observability. The returned family is the
    best-guess provider prefix (e.g. 'glm' for 'glm-4-flash') or
    ``'unknown'`` for unrecognized models.
    """
    if not model:
        return ('unknown', DEFAULT_CONTEXT_WINDOW)

    model_lower = model.lower()

    # 1. Exact-model override (highest priority).
    if model in MODEL_CONTEXT_WINDOWS:
        return (_family_for(model_lower), MODEL_CONTEXT_WINDOWS[model])

    # 2. Family-prefix lookup.
    for family, window in PROVIDER_CONTEXT_WINDOWS.items():
        if family in model_lower:
            return (family, window)

    # 3. Unknown -- warn and use conservative default. CC-2: include
    # model_family='unknown' as structured extra so dashboards can filter
    # on the conservative-default case and flag it for ops review.
    logger.warning(
        'token_budget.unknown_model_family model=%s defaulting_to=%d',
        model, DEFAULT_CONTEXT_WINDOW,
        extra={
            'model_family': 'unknown',
            'model': model,
            'default_window': DEFAULT_CONTEXT_WINDOW,
        },
    )
    return ('unknown', DEFAULT_CONTEXT_WINDOW)


def _family_for(model_lower: str) -> str:
    """Return the provider family for ``model_lower``."""
    for family in PROVIDER_CONTEXT_WINDOWS:
        if family in model_lower:
            return family
    return 'unknown'

# Safety margin — leave room for the response
DEFAULT_RESPONSE_RESERVE = 4_000

# Approximate characters per token (conservative for mixed CJK/Latin)
_CHARS_PER_TOKEN_LATIN = 4
_CHARS_PER_TOKEN_CJK = 2


def estimate_tokens(text: str) -> int:
    """Estimate token count for a string.

    Uses a simple heuristic:
    - CJK characters ≈ 0.5 tokens each (2 chars per token)
    - Latin/other ≈ 0.25 tokens each (4 chars per token)
    """
    if not text:
        return 0

    cjk_chars = len(re.findall(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', text))
    latin_chars = len(text) - cjk_chars

    tokens = (
        cjk_chars / _CHARS_PER_TOKEN_CJK
        + latin_chars / _CHARS_PER_TOKEN_LATIN
    )
    return max(int(tokens), 1)


class TokenBudget:
    """Track and enforce token budgets for a single LLM request.

    The ``model`` parameter determines the context window via family-aware
    lookup (Phase 4A). Callers should pass the active model so non-GLM
    fallback providers use their actual window size, not GLM's.
    """

    def __init__(
        self,
        model: str = 'glm-4.7-flash',
        response_reserve: int = DEFAULT_RESPONSE_RESERVE,
    ) -> None:
        # Phase 4A: prefer family-aware lookup; fall back to exact-model dict
        # for backward compat (e.g. tests that pass 'glm-4-flash' explicitly).
        family, family_window = context_window_for(model)
        exact_window = MODEL_CONTEXT_WINDOWS.get(model)
        context_window = exact_window if exact_window else family_window
        self._budget = context_window - response_reserve
        self._used = 0
        self._model = model
        self._family = family
        self._truncations: list[str] = []

    @property
    def remaining(self) -> int:
        return max(self._budget - self._used, 0)

    @property
    def used(self) -> int:
        return self._used

    @property
    def family(self) -> str:
        """Provider family for this budget (e.g. 'glm', 'gpt', 'unknown').

        CC-2: exposed so call sites (conversation_memory, eval harness) can
        include it in their own observability — when family=='unknown', the
        budget is using a conservative default and dashboards should flag it.
        """
        return self._family

    @property
    def context_window(self) -> int:
        """The total token budget (context_window - response_reserve)."""
        return self._budget

    def reserve(self, text: str, label: str = '') -> None:
        """Account for text in the budget without storing or truncating it.

        Use for must-include content (chat history, user message) that should
        reduce the remaining budget for shrinkable sections (system prompt)
        but must never itself be dropped. If the reserved text alone exceeds
        the budget, every subsequent ``add()`` returns ``''`` — which is the
        correct degraded behavior (better to ship a stub system prompt than
        to silently drop user input).
        """
        self._used += estimate_tokens(text)

    def add(self, text: str, label: str = '') -> str:
        """Add text to the budget. Truncates if it would exceed budget.

        Returns the (possibly truncated) text.
        """
        tokens = estimate_tokens(text)
        if self._used + tokens <= self._budget:
            self._used += tokens
            return text

        # Truncate to fit
        available = self._budget - self._used
        if available <= 0:
            if label:
                self._truncations.append(label)
                logger.warning(
                    'Token budget exhausted — dropped %s (%d tokens)',
                    label, tokens,
                )
            return ''

        # Estimate characters that fit
        approx_chars = available * _CHARS_PER_TOKEN_LATIN
        truncated = text[:approx_chars]
        self._used += estimate_tokens(truncated)
        if label:
            self._truncations.append(label)
            logger.warning(
                'Token budget: truncated %s from %d to ~%d tokens (budget: %d/%d)',
                label, tokens, estimate_tokens(truncated),
                self._used, self._budget,
            )
        return truncated

    def check_fits(self, text: str) -> bool:
        """Check if text would fit in the remaining budget."""
        return estimate_tokens(text) <= self.remaining

    @property
    def truncations(self) -> list[str]:
        return list(self._truncations)
