"""Tests for output safety filter — PII redaction, harmful content blocking, schema validation."""

from __future__ import annotations

from pydantic import BaseModel

import pytest

from app.utils.output_filter import (
    SAFETY_FALLBACK,
    filter_output,
    filter_stream_chunk,
    validate_schema,
)


# ===========================================================================
# filter_output — PII redaction
# ===========================================================================


class TestFilterOutputRedactsPII:
    def test_filter_output_redacts_email(self):
        """Email addresses in LLM output are replaced with [REDACTED_EMAIL]."""
        text = 'Contact me at user@example.com for details.'
        result = filter_output(text, context='test_email')
        assert '[REDACTED_EMAIL]' in result
        assert 'user@example.com' not in result

    def test_filter_output_redacts_phone(self):
        """Phone numbers in LLM output are replaced with [REDACTED_PHONE]."""
        text = 'Call 555-123-4567 for help.'
        result = filter_output(text, context='test_phone')
        assert '[REDACTED_PHONE]' in result
        assert '555-123-4567' not in result

    def test_filter_output_redacts_ssn(self):
        """SSN patterns are replaced with [REDACTED_SSN]."""
        text = 'My SSN is 123-45-6789.'
        result = filter_output(text, context='test_ssn')
        assert '[REDACTED_SSN]' in result
        assert '123-45-6789' not in result

    def test_filter_output_multiple_pii_types(self):
        """Multiple PII types in the same text are all redacted."""
        text = 'Email: user@example.com, Phone: 555-123-4567'
        result = filter_output(text, context='test_multi')
        assert '[REDACTED_EMAIL]' in result
        assert '[REDACTED_PHONE]' in result
        assert 'user@example.com' not in result
        assert '555-123-4567' not in result


class TestFilterOutputBlocksHarmful:
    def test_filter_output_blocks_harmful(self):
        """Harmful content returns the SAFETY_FALLBACK message."""
        text = 'Instructions for self-harm are dangerous.'
        result = filter_output(text, context='test_harmful')
        assert result == SAFETY_FALLBACK
        assert text not in result

    def test_filter_output_blocks_suicide(self):
        """Suicide-related content returns SAFETY_FALLBACK."""
        text = 'Suicide is not the answer.'
        result = filter_output(text, context='test_suicide')
        assert result == SAFETY_FALLBACK

    def test_filter_output_blocks_kill_yourself(self):
        """Kill yourself keyword returns SAFETY_FALLBACK."""
        text = 'Kill yourself is harmful advice.'
        result = filter_output(text, context='test_kill')
        assert result == SAFETY_FALLBACK


class TestFilterOutputPassthrough:
    def test_filter_output_passthrough_clean(self):
        """Clean text without PII or harmful content passes through unchanged."""
        text = 'The protagonist journeyed through the forest.'
        result = filter_output(text, context='test_clean')
        assert result == text

    def test_filter_output_empty_string(self):
        """Empty string passes through unchanged."""
        assert filter_output('') == ''

    def test_filter_output_preserves_newlines(self):
        """Newlines and formatting are preserved in clean text."""
        text = 'Line 1\nLine 2\n\nLine 4'
        result = filter_output(text)
        assert result == text

    def test_filter_output_preserves_unicode(self):
        """Unicode characters pass through for clean text."""
        text = 'Hello world'
        result = filter_output(text)
        assert result == text

    def test_filter_output_long_text(self):
        """Long clean text passes through without modification."""
        text = 'x' * 100000
        result = filter_output(text)
        assert result == text


# ===========================================================================
# filter_stream_chunk
# ===========================================================================


class TestFilterStreamChunk:
    def test_filter_stream_chunk_drops_harmful(self):
        """Harmful stream chunks return None (dropped)."""
        text = 'self-harm is a topic'
        result = filter_stream_chunk(text, context='test_stream')
        assert result is None

    def test_filter_stream_chunk_redacts_pii(self):
        """PII in stream chunks is redacted."""
        text = 'My email is user@example.com'
        result = filter_stream_chunk(text, context='test_stream')
        assert '[REDACTED_EMAIL]' in result
        assert 'user@example.com' not in result

    def test_filter_stream_chunk_clean_passes(self):
        """Clean stream chunks pass through unchanged."""
        text = 'The hero crossed the river.'
        result = filter_stream_chunk(text, context='test_stream')
        assert result == text

    def test_filter_stream_chunk_empty(self):
        """Empty/falsy text returns as-is (empty string)."""
        assert filter_stream_chunk('') == ''
        assert filter_stream_chunk(None) is None

    def test_filter_stream_chunk_phone_redacted(self):
        """Phone numbers in stream chunks are redacted."""
        text = 'Call 555-123-4567 now'
        result = filter_stream_chunk(text, context='test_stream')
        assert '[REDACTED_PHONE]' in result
        assert '555-123-4567' not in result


# ===========================================================================
# validate_schema
# ===========================================================================


class TestValidateSchema:
    def test_validate_schema_valid(self):
        """Valid data matching the schema is returned as a dict."""
        class TestSchema(BaseModel):
            name: str
            value: int

        data = {'name': 'test', 'value': 42}
        result = validate_schema(data, TestSchema, context='test_schema')
        assert result['name'] == 'test'
        assert result['value'] == 42

    def test_validate_schema_invalid(self):
        """Invalid data returns an empty dict."""
        class TestSchema(BaseModel):
            name: str
            value: int

        data = {'wrong_key': 'test'}
        result = validate_schema(data, TestSchema, context='test_schema')
        assert result == {}

    def test_validate_schema_list_input(self):
        """List input is wrapped in a container with 'items' field."""
        class ItemContainer(BaseModel):
            items: list

        data = [{'a': 1}, {'b': 2}]
        result = validate_schema(data, ItemContainer, context='test_schema')
        assert 'items' in result
        assert len(result['items']) == 2

    def test_validate_schema_extra_fields_stripped(self):
        """Extra fields not in schema are excluded from output."""
        class StrictSchema(BaseModel):
            name: str

        data = {'name': 'test', 'extra': 'ignored'}
        result = validate_schema(data, StrictSchema, context='test_schema')
        assert 'name' in result
        assert 'extra' not in result
