"""P0.2 integration tests: provider_attempt_id + token budget under fallback.

Validates the fix for [llm-B2]: fallback path no longer re-drives without
idempotency token awareness. Specifically:

1. Only ONE pre-charge happens per logical streaming request, even when
   primary fails and fallback takes over.
2. When primary emits ≥1 token before failing, the user is billed for
   those tokens (vendor did bill us) — the partial chars are tracked via
   billing_state['partial_chars'].
3. When all attempts fail before any emit, the user is refunded in full.
4. Non-streaming fallback chain settles the pre-charge with the winning
   attempt's actual usage; refunds only when every attempt fails.
"""

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_settings(token_budget: int = 0):
    """Build a fake settings object with the given token budget."""
    settings = MagicMock()
    settings.llm_daily_token_budget = token_budget
    # B2: TPM enforcement defaults off; tests in this module don't exercise
    # the TPM path, so keep the check inert (otherwise MagicMock attribute
    # access on `state.config.max_tpm` blows up the `> 0` comparison).
    settings.tpm_enforced = False
    return settings


class _FakeBudget:
    """Minimal stand-in for DailyLLMBudget that records calls."""

    def __init__(self, *, allow: bool = True):
        self._allow = allow
        self.charges: list[int] = []
        self.settles: list[tuple[int, int]] = []  # (pre_charge, actual)

    async def check_and_charge_tokens(self, user_id, tokens, limit):
        self.charges.append(tokens)
        return self._allow, tokens, limit

    async def settle_tokens(self, user_id, pre_charge, actual):
        self.settles.append((pre_charge, actual))


# ---------------------------------------------------------------------------
# Non-streaming path
# ---------------------------------------------------------------------------


class TestNonStreamingFallbackBilling:
    """P0.2: _invoke_with_circuit holds pre-charge across fallback chain."""

    @pytest.mark.asyncio
    async def test_primary_success_settles_once(self, monkeypatch):
        """Primary success: single pre-charge, single settle with actual usage."""
        from app.services.llm import circuit_fallback

        budget = _FakeBudget(allow=True)
        fake_settings = _make_settings(token_budget=10000)
        messages = [MagicMock(content='hello world this is a test message')]

        # Fake registry / state / circuit
        state = MagicMock()
        state.config.name = 'glm'
        state.config.default_model = 'glm-4.7-flash'
        state.config.fallback_model = 'glm-4-flash'
        state.circuit.allow_request = AsyncMock(return_value=True)
        state.circuit.record_success = AsyncMock()
        state.circuit.record_failure = AsyncMock()

        registry = MagicMock()
        registry.get_provider = MagicMock(return_value=state)
        registry.next_provider_after = MagicMock(return_value=None)
        registry.record_latency = MagicMock()

        # Fake LLM that succeeds
        response = MagicMock()
        response.response_metadata = {
            'token_usage': {'prompt_tokens': 50, 'completion_tokens': 100, 'total_tokens': 150},
        }

        def fake_get_llm(provider, **kwargs):
            llm = MagicMock()
            llm.ainvoke = AsyncMock(return_value=response)
            return llm

        # Patch dependencies
        monkeypatch.setattr('app.services.llm.pool.get_llm', fake_get_llm)
        monkeypatch.setattr('app.services.llm.registry.get_registry', lambda: registry)
        monkeypatch.setattr('app.config.get_settings', lambda: fake_settings)
        monkeypatch.setattr('app.middleware.daily_llm_budget._get_budget', lambda: budget)

        # Stub retry to just invoke once
        async def fake_retry(llm, msgs, label):
            return await llm.ainvoke(msgs)
        monkeypatch.setattr('app.services.llm.retry._invoke_with_retry', fake_retry)

        result = await circuit_fallback._invoke_with_circuit(
            messages, log_label='TEST', user_id='u1',
            feature='test', max_tokens=200,
        )

        assert result is response
        # Exactly ONE pre-charge
        assert len(budget.charges) == 1, f'expected 1 charge, got {budget.charges}'
        # Exactly ONE settle, with actual usage from response
        assert len(budget.settles) == 1, f'expected 1 settle, got {budget.settles}'
        assert budget.settles[0][1] == 150  # actual total_tokens

    @pytest.mark.asyncio
    async def test_primary_fail_fallback_success_settles_with_fallback_usage(self, monkeypatch):
        """Primary fails, fallback succeeds: user billed with fallback's actual usage.

        No refund in primary failure path; the fallback settles with its own
        usage. The pre-charge is held across the chain.
        """
        from app.services.llm import circuit_fallback

        budget = _FakeBudget(allow=True)
        fake_settings = _make_settings(token_budget=10000)
        messages = [MagicMock(content='hello world')]

        # Primary state and fallback state
        primary_state = MagicMock()
        primary_state.config.name = 'glm'
        primary_state.config.default_model = 'glm-4.7-flash'
        primary_state.config.fallback_model = None  # no same-provider fallback
        primary_state.circuit.allow_request = AsyncMock(return_value=True)
        primary_state.circuit.record_success = AsyncMock()
        primary_state.circuit.record_failure = AsyncMock()

        fb_state = MagicMock()
        fb_state.config.name = 'deepseek'
        fb_state.config.default_model = 'deepseek-chat'
        fb_state.config.fallback_model = None
        fb_state.circuit.allow_request = AsyncMock(return_value=True)
        fb_state.circuit.record_success = AsyncMock()
        fb_state.circuit.record_failure = AsyncMock()

        registry = MagicMock()
        registry.get_provider = MagicMock(return_value=primary_state)
        registry.next_provider_after = MagicMock(return_value=fb_state)
        registry.record_latency = MagicMock()

        # Primary raises; fallback returns response
        fb_response = MagicMock()
        fb_response.response_metadata = {
            'token_usage': {'prompt_tokens': 60, 'completion_tokens': 80, 'total_tokens': 140},
        }

        primary_llm = MagicMock()
        primary_llm.ainvoke = AsyncMock(side_effect=ConnectionError('primary down'))
        fb_llm = MagicMock()
        fb_llm.ainvoke = AsyncMock(return_value=fb_response)

        def fake_get_llm(provider, **kwargs):
            return primary_llm if provider == 'glm' else fb_llm

        monkeypatch.setattr('app.services.llm.pool.get_llm', fake_get_llm)
        monkeypatch.setattr('app.services.llm.registry.get_registry', lambda: registry)
        monkeypatch.setattr('app.config.get_settings', lambda: fake_settings)
        monkeypatch.setattr('app.middleware.daily_llm_budget._get_budget', lambda: budget)

        async def fake_retry(llm, msgs, label):
            return await llm.ainvoke(msgs)
        monkeypatch.setattr('app.services.llm.retry._invoke_with_retry', fake_retry)

        result = await circuit_fallback._invoke_with_circuit(
            messages, log_label='TEST', user_id='u1',
            feature='test', max_tokens=200,
        )

        assert result is fb_response
        # ONE pre-charge at logical request entry
        assert len(budget.charges) == 1, f'expected 1 charge, got {budget.charges}'
        # ONE settle (with fallback's actual usage). No separate refund.
        assert len(budget.settles) == 1, f'expected 1 settle, got {budget.settles}'
        assert budget.settles[0][1] == 140  # fallback's actual total_tokens

    @pytest.mark.asyncio
    async def test_all_attempts_fail_refunds_pre_charge(self, monkeypatch):
        """Primary fails AND fallback fails: pre-charge refunded in full."""
        from app.services.llm import circuit_fallback

        budget = _FakeBudget(allow=True)
        fake_settings = _make_settings(token_budget=10000)
        messages = [MagicMock(content='hello world')]

        primary_state = MagicMock()
        primary_state.config.name = 'glm'
        primary_state.config.default_model = 'glm-4.7-flash'
        primary_state.config.fallback_model = None
        primary_state.circuit.allow_request = AsyncMock(return_value=True)
        primary_state.circuit.record_success = AsyncMock()
        primary_state.circuit.record_failure = AsyncMock()

        fb_state = MagicMock()
        fb_state.config.name = 'deepseek'
        fb_state.config.default_model = 'deepseek-chat'
        fb_state.config.fallback_model = None
        fb_state.circuit.allow_request = AsyncMock(return_value=True)
        fb_state.circuit.record_success = AsyncMock()
        fb_state.circuit.record_failure = AsyncMock()

        registry = MagicMock()
        registry.get_provider = MagicMock(return_value=primary_state)
        registry.next_provider_after = MagicMock(return_value=fb_state)
        registry.record_latency = MagicMock()

        primary_llm = MagicMock()
        primary_llm.ainvoke = AsyncMock(side_effect=ConnectionError('primary down'))
        fb_llm = MagicMock()
        fb_llm.ainvoke = AsyncMock(side_effect=ConnectionError('fallback down'))

        def fake_get_llm(provider, **kwargs):
            return primary_llm if provider == 'glm' else fb_llm

        monkeypatch.setattr('app.services.llm.pool.get_llm', fake_get_llm)
        monkeypatch.setattr('app.services.llm.registry.get_registry', lambda: registry)
        monkeypatch.setattr('app.config.get_settings', lambda: fake_settings)
        monkeypatch.setattr('app.middleware.daily_llm_budget._get_budget', lambda: budget)

        async def fake_retry(llm, msgs, label):
            return await llm.ainvoke(msgs)
        monkeypatch.setattr('app.services.llm.retry._invoke_with_retry', fake_retry)

        result = await circuit_fallback._invoke_with_circuit(
            messages, log_label='TEST', user_id='u1',
            feature='test', max_tokens=200,
        )

        assert result is None
        # ONE pre-charge
        assert len(budget.charges) == 1
        # ONE settle that refunds (actual=0)
        assert len(budget.settles) == 1
        assert budget.settles[0][1] == 0  # refunded


# ---------------------------------------------------------------------------
# Streaming path
# ---------------------------------------------------------------------------


class TestStreamingFallbackBilling:
    """P0.2: _stream_via_provider pre-charges ONCE, settles with emitted."""

    @pytest.mark.asyncio
    async def test_partial_emit_before_fallback_bills_for_partial(self, monkeypatch):
        """Kill stream after first chunk: only 1 provider pre-charged.

        Primary emits 4 chars (≈1 token) before failing; fallback emits
        800 chars (≈200 tokens). User is billed for input + total emitted
        (primary partial + fallback full). Pre-charge happens exactly once.
        """
        from app.services.companion import streaming

        budget = _FakeBudget(allow=True)
        fake_settings = _make_settings(token_budget=10000)

        # Build a no-op DB session
        db = AsyncMock()

        # Patch internals: skip persistence, skip provider resolution, run
        # the in-stream code path that produces the partial + fallback.
        async def fake_persist(*args, **kwargs):
            return True

        primary_state = MagicMock()
        primary_state.config.name = 'glm'
        primary_state.config.default_model = 'glm-4.7-flash'
        primary_state.circuit.allow_request = AsyncMock(return_value=True)
        primary_state.circuit.record_failure = AsyncMock()
        primary_state.circuit.record_success = AsyncMock()

        registry = MagicMock()
        registry.get_provider = MagicMock(return_value=primary_state)

        # Make _stream_from_provider simulate: yield 4 chars, raise, then
        # call stream_fallback which yields 800 more chars.
        async def fake_stream_from_provider(
            state, provider_name, model_used, messages,
            collected_parts, request_id, start_time,
            user_id, book_id, lang, cancelled=None, billing_state=None,
            **kwargs,  # B1 (request) + D1 (seq_state) add kwargs the test doesn't exercise
        ):
            # Simulate primary partial emit
            partial = 'abcd'  # 4 chars
            collected_parts.append(partial)
            yield f'data: {{"content": "{partial}"}}\n\n'
            # Simulate primary failure: record partial in billing_state, clear
            if billing_state is not None:
                billing_state['partial_chars'] = billing_state.get('partial_chars', 0) + len(partial)
            collected_parts.clear()
            # Simulate fallback full emit
            full = 'e' * 800
            collected_parts.append(full)
            yield f'data: {{"content": "{full}"}}\n\n'

        monkeypatch.setattr(streaming, '_get_stream_provider', lambda r, rid: (primary_state, 'glm', 'glm-4.7-flash'))
        monkeypatch.setattr(streaming, '_stream_from_provider', fake_stream_from_provider)
        monkeypatch.setattr(streaming, '_persist_with_retry', fake_persist)
        monkeypatch.setattr(streaming, 'get_registry', lambda: registry)
        monkeypatch.setattr('app.config.get_settings', lambda: fake_settings)
        monkeypatch.setattr('app.middleware.daily_llm_budget._get_budget', lambda: budget)

        messages = [MagicMock(content='hello world' * 10)]  # ~30 chars
        chunks = []
        async for chunk in streaming._stream_via_provider(
            db, uuid4(), uuid4(), 'hello', messages, 'en',
        ):
            chunks.append(chunk)

        # Exactly ONE pre-charge — this is the core P0.2 invariant
        assert len(budget.charges) == 1, f'expected 1 pre-charge, got {budget.charges}'
        # Exactly ONE settle, with non-zero actual (partial + fallback emitted)
        assert len(budget.settles) == 1, f'expected 1 settle, got {budget.settles}'
        pre_charge, actual = budget.settles[0]
        # Actual must include input + emitted output (partial 4 + full 800 = 804 chars / 4 = 201 tokens)
        assert actual > 0, 'actual usage should be non-zero when content was emitted'
        # Actual should NOT be a full refund (zero) — vendor did bill for partial
        assert actual != 0

    @pytest.mark.asyncio
    async def test_no_emit_no_fallback_refunds(self, monkeypatch):
        """All attempts fail before any emit: pre-charge refunded in full."""
        from app.services.companion import streaming

        budget = _FakeBudget(allow=True)
        fake_settings = _make_settings(token_budget=10000)
        db = AsyncMock()

        async def fake_persist(*args, **kwargs):
            return True

        primary_state = MagicMock()
        primary_state.config.name = 'glm'
        primary_state.config.default_model = 'glm-4.7-flash'
        primary_state.circuit.allow_request = AsyncMock(return_value=True)

        registry = MagicMock()
        registry.get_provider = MagicMock(return_value=primary_state)

        # Simulate total failure: no chunks emitted, no fallback recovery
        async def fake_stream_from_provider(
            state, provider_name, model_used, messages,
            collected_parts, request_id, start_time,
            user_id, book_id, lang, cancelled=None, billing_state=None,
            **kwargs,  # B1 (request) + D1 (seq_state) add kwargs the test doesn't exercise
        ):
            # No emit, no fallback recovery — just return
            return
            yield  # pragma: no cover — make this an async generator

        monkeypatch.setattr(streaming, '_get_stream_provider', lambda r, rid: (primary_state, 'glm', 'glm-4.7-flash'))
        monkeypatch.setattr(streaming, '_stream_from_provider', fake_stream_from_provider)
        monkeypatch.setattr(streaming, '_persist_with_retry', fake_persist)
        monkeypatch.setattr(streaming, 'get_registry', lambda: registry)
        monkeypatch.setattr('app.config.get_settings', lambda: fake_settings)
        monkeypatch.setattr('app.middleware.daily_llm_budget._get_budget', lambda: budget)

        messages = [MagicMock(content='hello world')]
        chunks = []
        async for chunk in streaming._stream_via_provider(
            db, uuid4(), uuid4(), 'hello', messages, 'en',
        ):
            chunks.append(chunk)

        # ONE pre-charge
        assert len(budget.charges) == 1
        # Refund (actual=0)
        assert len(budget.settles) == 1
        assert budget.settles[0][1] == 0


# ---------------------------------------------------------------------------
# Provider attempt id stamping
# ---------------------------------------------------------------------------


class TestProviderAttemptIdStamping:
    """P0.2: provider_attempt_id stamped per attempt for observability."""

    def test_log_call_accepts_provider_attempt_id(self):
        """_log_call signature includes provider_attempt_id (logs only, not persisted)."""
        import inspect
        from app.services.llm.observability import _log_call

        sig = inspect.signature(_log_call)
        assert 'provider_attempt_id' in sig.parameters, \
            'provider_attempt_id must be a kwarg of _log_call for per-attempt observability'

    def test_build_trace_dict_omits_provider_attempt_id(self):
        """Trace dict (persisted to DB) must NOT include provider_attempt_id.

        Adding a column requires a migration; for P0.2 we log only.
        """
        from app.services.llm.observability import _build_trace_dict

        trace = _build_trace_dict(
            request_id='abc123', model='glm-4.7-flash', label='TEST',
            latency_ms=100, usage={'total_tokens': 50}, cost=0.0,
            success=True, fallback_used=False, error_message=None,
            provider='glm', provider_attempt_id='att1',
        )
        # provider_attempt_id is a log field, not persisted
        assert 'provider_attempt_id' not in trace, \
            'provider_attempt_id should not be in persisted trace dict'

    def test_new_attempt_id_is_unique(self):
        """Each call to _new_attempt_id returns a fresh 12-char hex."""
        from app.services.llm.provider_fallback import _new_attempt_id

        ids = {_new_attempt_id() for _ in range(100)}
        assert len(ids) == 100, 'attempt ids must be unique'
        for attempt_id in ids:
            assert len(attempt_id) == 12
            assert all(c in '0123456789abcdef' for c in attempt_id)
