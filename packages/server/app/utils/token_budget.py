"""Token budgeting for LLM prompts.

Estimates token counts and enforces budgets to prevent oversized prompts
from exceeding model context windows.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger('read-pal.token_budget')

# GLM-4 context window limits
MODEL_CONTEXT_WINDOWS: dict[str, int] = {
    'glm-4.7-flash': 128_000,
    'glm-4-flash': 128_000,
    'glm-4': 128_000,
    'embedding-3': 8_000,
}

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
    """Track and enforce token budgets for a single LLM request."""

    def __init__(
        self,
        model: str = 'glm-4.7-flash',
        response_reserve: int = DEFAULT_RESPONSE_RESERVE,
    ) -> None:
        context_window = MODEL_CONTEXT_WINDOWS.get(model, 128_000)
        self._budget = context_window - response_reserve
        self._used = 0
        self._model = model
        self._truncations: list[str] = []

    @property
    def remaining(self) -> int:
        return max(self._budget - self._used, 0)

    @property
    def used(self) -> int:
        return self._used

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
