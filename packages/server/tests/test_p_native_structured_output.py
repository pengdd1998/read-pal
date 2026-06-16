"""C2 — Feature-flagged native structured output (response_format=json_object).

When providers support ``response_format={'type': 'json_object'}`` (OpenAI
family, GLM, Anthropic-via-passthrough), the LLM is more likely to emit
parseable JSON on the first try. Without it, ``safe_llm_invoke`` relies on
a prompt-only JSON contract that routinely drifts into prose-wrapped JSON
or trailing-comma gibberish — handled by the 3-stage repair ladder, but
the ladder firing is a leading indicator of prompt / contract drift.

Feature flag is OFF by default — flipped on per-deployment after verifying
provider support. The repair ladder stays as a safety net even when the
flag is on, because providers occasionally violate the contract under load.

These tests pin:
- Flag OFF (default) → no response_format in model_kwargs
- Flag ON + schema_class → response_format set
- Flag ON + no schema_class (plain text) → response_format NOT set
- Pool keying isolates the two variants (no shared instance)
- Helper reads from settings defensively
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# _should_use_native_structured_output helper
# ---------------------------------------------------------------------------


def test_helper_returns_false_when_schema_class_is_none():
    """Plain-text calls (safe_llm_call) never opt in — schema_class is None
    on that path."""
    from app.services.llm.safe_invoke import _should_use_native_structured_output
    with patch('app.config.get_settings') as mock_s:
        mock_s.return_value.llm_native_structured_output = True
        assert _should_use_native_structured_output(None) is False


def test_helper_returns_false_when_flag_off():
    """Default — flag off, even with a schema_class, stays on prompt-only path."""
    from app.services.llm.safe_invoke import _should_use_native_structured_output
    with patch('app.config.get_settings') as mock_s:
        mock_s.return_value.llm_native_structured_output = False
        schema = type('S', (), {})  # any class
        assert _should_use_native_structured_output(schema) is False


def test_helper_returns_true_when_flag_on_and_schema_class_set():
    from app.services.llm.safe_invoke import _should_use_native_structured_output
    with patch('app.config.get_settings') as mock_s:
        mock_s.return_value.llm_native_structured_output = True
        schema = type('S', (), {})  # any class
        assert _should_use_native_structured_output(schema) is True


def test_helper_returns_false_on_settings_import_error():
    """Defensive: if settings can't load, default to OFF (don't 500 the
    request — just stay on the proven prompt-only path)."""
    from app.services.llm.safe_invoke import _should_use_native_structured_output
    with patch('app.config.get_settings', side_effect=RuntimeError('boom')):
        schema = type('S', (), {})  # any class
        assert _should_use_native_structured_output(schema) is False


# ---------------------------------------------------------------------------
# Pool: model_kwargs construction
# ---------------------------------------------------------------------------


def test_pool_passes_response_format_when_structured_output_true():
    """When structured_output=True, ChatOpenAI is constructed with
    model_kwargs={'response_format': {'type': 'json_object'}}."""
    from app.services.llm import pool
    from app.services.llm.registry import ProviderState
    from app.config import ProviderConfig

    cfg = ProviderConfig(
        name='test-so', base_url='http://localhost', api_key='test',
        models={'default': 'test-model'},
    )
    state = ProviderState(config=cfg)
    fake_registry = MagicMock()
    fake_registry.get_provider_by_name = MagicMock(return_value=state)
    fake_registry.get_provider = MagicMock(return_value=state)

    with patch('app.services.llm.registry.get_registry', return_value=fake_registry), \
         patch('app.services.llm.pool.ChatOpenAI') as mock_chat:
        pool.get_llm(provider='test-so', structured_output=True)

    _, kwargs = mock_chat.call_args
    assert kwargs.get('model_kwargs') == {
        'response_format': {'type': 'json_object'},
    }


def test_pool_omits_response_format_when_structured_output_false():
    """Default — no model_kwargs.response_format. ChatOpenAI gets no
    structured-output hint and the prompt contract is the only guard."""
    from app.services.llm import pool
    from app.services.llm.registry import ProviderState
    from app.config import ProviderConfig

    cfg = ProviderConfig(
        name='test-no-so', base_url='http://localhost', api_key='test',
        models={'default': 'test-model'},
    )
    state = ProviderState(config=cfg)
    fake_registry = MagicMock()
    fake_registry.get_provider_by_name = MagicMock(return_value=state)
    fake_registry.get_provider = MagicMock(return_value=state)

    with patch('app.services.llm.registry.get_registry', return_value=fake_registry), \
         patch('app.services.llm.pool.ChatOpenAI') as mock_chat:
        pool.get_llm(provider='test-no-so', structured_output=False)

    _, kwargs = mock_chat.call_args
    # Either model_kwargs is absent OR it doesn't carry response_format.
    mk = kwargs.get('model_kwargs')
    if mk is not None:
        assert 'response_format' not in mk


def test_pool_keys_variants_separately():
    """Critical: two callers with structured_output True vs False must get
    distinct ChatOpenAI instances. Without this, flipping the flag on for
    one caller would mutate the shared instance's kwargs."""
    from app.services.llm import pool
    from app.services.llm.registry import ProviderState
    from app.config import ProviderConfig

    cfg = ProviderConfig(
        name='test-keying', base_url='http://localhost', api_key='test',
        models={'default': 'test-model'},
    )
    state = ProviderState(config=cfg)
    fake_registry = MagicMock()
    fake_registry.get_provider_by_name = MagicMock(return_value=state)
    fake_registry.get_provider = MagicMock(return_value=state)

    with patch('app.services.llm.registry.get_registry', return_value=fake_registry), \
         patch('app.services.llm.pool.ChatOpenAI') as mock_chat:
        pool.get_llm(provider='test-keying', structured_output=False)
        pool.get_llm(provider='test-keying', structured_output=True)
        pool.get_llm(provider='test-keying', structured_output=False)  # cached

    # Two distinct constructions — one for each variant. The third call
    # returns the cached non-SO instance (no third construction).
    assert mock_chat.call_count == 2


# ---------------------------------------------------------------------------
# Integration: safe_llm_invoke threads structured_output through
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_safe_llm_invoke_threads_structured_output_when_flag_on():
    """End-to-end: with the flag ON and a schema_class, safe_llm_invoke
    must pass structured_output=True down to _invoke_with_circuit (which
    in turn passes it to the pool)."""
    from app.services.llm import safe_invoke
    from pydantic import BaseModel

    class _Schema(BaseModel):
        x: int

    with patch('app.config.get_settings') as mock_s, \
         patch('app.services.llm.safe_invoke._invoke_with_circuit') as mock_invoke, \
         patch('app.services.llm.safe_invoke._check_json_cache') as mock_cache:
        mock_s.return_value.llm_native_structured_output = True
        mock_cache.return_value = safe_invoke._MISS  # cache miss
        mock_invoke.return_value = MagicMock(content='{"x": 42}')

        await safe_invoke.safe_llm_invoke(
            messages=[], schema_class=_Schema, log_label='test-so',
            use_cache=False,
        )

    _, kwargs = mock_invoke.call_args
    assert kwargs.get('structured_output') is True


@pytest.mark.asyncio
async def test_safe_llm_invoke_skips_structured_output_when_flag_off():
    """Flag OFF (default) — schema_class present but structured_output
    stays False on the invoke path."""
    from app.services.llm import safe_invoke
    from pydantic import BaseModel

    class _Schema(BaseModel):
        x: int

    with patch('app.config.get_settings') as mock_s, \
         patch('app.services.llm.safe_invoke._invoke_with_circuit') as mock_invoke:
        mock_s.return_value.llm_native_structured_output = False
        mock_invoke.return_value = MagicMock(content='{"x": 42}')

        await safe_invoke.safe_llm_invoke(
            messages=[], schema_class=_Schema, log_label='test-no-so',
            use_cache=False,
        )

    _, kwargs = mock_invoke.call_args
    assert kwargs.get('structured_output') is False


@pytest.mark.asyncio
async def test_repair_ladder_still_fires_on_provider_violation():
    """Even with native structured output ON, providers occasionally
    violate the contract under load. The 3-stage repair ladder must
    still fire and recover valid JSON from prose-wrapped output."""
    from app.services.llm import safe_invoke
    from pydantic import BaseModel

    class _Schema(BaseModel):
        x: int

    # Simulated provider response: prose-prefixed JSON (the classic
    # violation pattern that the repair ladder handles).
    prose_wrapped = 'Sure! Here is the JSON:\n```json\n{"x": 42}\n```'

    with patch('app.config.get_settings') as mock_s, \
         patch('app.services.llm.safe_invoke._invoke_with_circuit') as mock_invoke:
        mock_s.return_value.llm_native_structured_output = True
        mock_invoke.return_value = MagicMock(content=prose_wrapped)

        result = await safe_invoke.safe_llm_invoke(
            messages=[], schema_class=_Schema, log_label='test-repair',
            use_cache=False,
        )

    # Repair ladder recovered the JSON object and validated against schema.
    assert result == {'x': 42}
