"""Output safety filter for LLM responses.

Validates LLM output before returning to users. Checks for:
- PII leakage (email, phone patterns)
- Harmful content indicators
- Schema compliance (via Pydantic)
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger('read-pal.output_filter')

# PII patterns that should NOT appear in LLM output
_PII_PATTERNS = [
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'), 'email'),
    (re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'), 'phone_number'),
    (re.compile(r'\b\d{3}-\d{2}-\d{4}\b'), 'SSN'),
    (re.compile(r'\b(?:\d[ -]?){13,19}\b'), 'credit_card'),
]

# Content that should be flagged for review
_HARMFUL_KEYWORDS = [
    'suicide', 'self-harm', 'kill yourself',
]


def filter_output(text: str, *, context: str = 'llm_output') -> str:
    """Filter LLM output for safety issues.

    Logs warnings for detected issues but does NOT modify the text —
    the caller decides whether to return it.
    Returns the original text with warnings logged.
    """
    if not text:
        return text

    # Check for PII
    for pattern, pii_type in _PII_PATTERNS:
        matches = pattern.findall(text)
        if matches:
            logger.warning(
                'PII detected in %s: type=%s, count=%d',
                context, pii_type, len(matches),
            )

    # Check for harmful content
    text_lower = text.lower()
    for keyword in _HARMFUL_KEYWORDS:
        if keyword in text_lower:
            logger.warning(
                'Potentially harmful content in %s: keyword=%.30s',
                context, keyword,
            )
            break

    return text


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
