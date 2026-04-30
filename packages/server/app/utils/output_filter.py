"""Output safety filter for LLM responses.

Validates LLM output before returning to users. Checks for:
- PII leakage (email, phone patterns) — redacted automatically
- Harmful content indicators — blocked with safe fallback
- Schema compliance (via Pydantic)
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger('read-pal.output_filter')

SAFETY_FALLBACK = (
    "I'm sorry, I can't respond to that. "
    "If you're in distress, please contact a helpline."
)

# PII patterns that should NOT appear in LLM output
_PII_PATTERNS = [
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'), 'email', '[REDACTED_EMAIL]'),
    (re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'), 'phone_number', '[REDACTED_PHONE]'),
    (re.compile(r'\b\d{3}-\d{2}-\d{4}\b'), 'SSN', '[REDACTED_SSN]'),
    (re.compile(r'\b(?:\d[ -]?){13,19}\b'), 'credit_card', '[REDACTED_CC]'),
]

# Content that should be blocked
_HARMFUL_KEYWORDS = [
    'suicide', 'self-harm', 'kill yourself',
]


def _is_harmful(text: str) -> bool:
    """Return True if text contains harmful keywords."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in _HARMFUL_KEYWORDS)


def _redact_pii(text: str, *, context: str = '') -> str:
    """Replace PII patterns with redaction tokens, logging each type found."""
    for pattern, pii_type, replacement in _PII_PATTERNS:
        matches = pattern.findall(text)
        if matches:
            logger.warning(
                'PII detected in %s: type=%s, count=%d',
                context, pii_type, len(matches),
            )
            text = pattern.sub(replacement, text)
    return text


def filter_output(text: str, *, context: str = 'llm_output') -> str:
    """Filter LLM output for safety issues.

    - Redacts PII (email, phone, SSN, credit card) with placeholder tokens.
    - Blocks harmful content by returning SAFETY_FALLBACK.
    - Logs all detections for observability.
    """
    if not text:
        return text

    # Block harmful content first
    if _is_harmful(text):
        for keyword in _HARMFUL_KEYWORDS:
            if keyword in text.lower():
                logger.warning(
                    'Blocked harmful content in %s: keyword=%.30s',
                    context, keyword,
                )
                break
        return SAFETY_FALLBACK

    # Redact PII
    return _redact_pii(text, context=context)


def filter_stream_chunk(text: str, *, context: str = 'stream') -> str | None:
    """Lightweight safety filter for SSE streaming chunks.

    Returns None if the chunk should be dropped (harmful content).
    Returns the text with PII redacted if safe.
    Intended for per-chunk use during streaming without heavy processing.
    """
    if not text:
        return text

    if _is_harmful(text):
        logger.warning('Dropped harmful stream chunk in %s', context)
        return None

    return _redact_pii(text, context=context)


def validate_schema(data: dict | list, schema_class, *, context: str = 'llm_output') -> dict:
    """Validate LLM output against a Pydantic schema.

    Returns validated data on success, or empty dict on failure.
    Logs warnings for validation failures.
    """
    try:
        if isinstance(data, list):
            # Wrap list in the expected container
            result = schema_class.model_validate({'items': data})
            return result.model_dump()
        result = schema_class.model_validate(data)
        return result.model_dump()
    except Exception as exc:
        logger.warning(
            'Schema validation failed for %s: %s. Data keys: %s',
            context, exc,
            list(data.keys()) if isinstance(data, dict) else f'list({len(data)})',
        )
        return {}
