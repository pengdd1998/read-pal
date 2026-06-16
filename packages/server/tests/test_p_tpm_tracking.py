"""B2 — provider-level TPM (tokens-per-minute) tracking.

Closes the gap where RPM and TPM were treated as the same thing: a
500-token request and an 80K-token request both counted as "1 call"
against RPM, so a long-context abuser could exhaust a provider's
token budget without ever hitting the RPM cap.

These tests pin the TPM contract: counter increments on actual usage,
window resets after 60s, cap-enforcement path raises with Retry-After,
and disabled-by-default (max_tpm=0 or tpm_enforced=False) is a no-op.
"""

from __future__ import annotations

import time
from unittest.mock import patch

import pytest

from app.config import ProviderConfig
from app.services.llm.registry import (
    ProviderRegistry, ProviderState, _TPM_WINDOW_SECONDS,
)


def _make_state(max_tpm: int = 0) -> ProviderState:
    cfg = ProviderConfig(
        name='test-provider',
        base_url='http://localhost',
        api_key='test',
        models={'default': 'test-model'},
        max_tpm=max_tpm,
    )
    return ProviderState(config=cfg)


# ---------------------------------------------------------------------------
# Counter semantics
# ---------------------------------------------------------------------------


def test_increment_tpm_accumulates_within_window():
    state = _make_state(max_tpm=100_000)
    state.increment_tpm(500)
    state.increment_tpm(300)
    assert state.token_count == 800


def test_increment_tpm_resets_window_after_60_seconds():
    state = _make_state(max_tpm=100_000)
    state.increment_tpm(500)
    assert state.token_count == 500
    # Simulate 61s elapsed
    state.token_window_start = time.monotonic() - (_TPM_WINDOW_SECONDS + 1)
    state.increment_tpm(100)
    assert state.token_count == 100, 'window reset should drop the prior 500'


def test_increment_tpm_zero_is_noop():
    state = _make_state(max_tpm=100_000)
    state.increment_tpm(0)
    assert state.token_count == 0


def test_increment_tpm_negative_clamps_at_zero():
    """Refund larger than current window count doesn't go negative —
    that would imply crediting tokens never counted in this window."""
    state = _make_state(max_tpm=100_000)
    state.increment_tpm(100)
    state.increment_tpm(-500)  # over-refund
    assert state.token_count == 0


def test_increment_tpm_negative_settles_pre_charge():
    """The intended use case: pre-charge 1000, settle at 700 → -300 delta."""
    state = _make_state(max_tpm=100_000)
    state.increment_tpm(1000)
    state.increment_tpm(700 - 1000)
    assert state.token_count == 700


# ---------------------------------------------------------------------------
# Availability check
# ---------------------------------------------------------------------------


def test_tpm_available_returns_true_when_cap_disabled():
    state = _make_state(max_tpm=0)
    assert state.tpm_available(100_000_000) is True


def test_tpm_available_returns_true_under_cap():
    state = _make_state(max_tpm=10_000)
    state.increment_tpm(5_000)
    assert state.tpm_available(4_000) is True  # 5000 + 4000 < 10000


def test_tpm_available_returns_false_at_cap():
    state = _make_state(max_tpm=10_000)
    state.increment_tpm(8_000)
    assert state.tpm_available(3_000) is False  # 8000 + 3000 > 10000


def test_tpm_available_at_exact_cap_with_zero_estimate_returns_false():
    """Strict less-than: a provider sitting at exactly the cap has no
    headroom for any new request. This is what _available_providers
    relies on to fall through to the next provider."""
    state = _make_state(max_tpm=10_000)
    state.increment_tpm(10_000)
    assert state.tpm_available(0) is False
    assert state.tpm_available() is False


def test_tpm_available_zero_estimate_just_checks_current():
    """tpm_available() with no args returns False only when window is
    already over the cap (used by _available_providers filtering)."""
    state = _make_state(max_tpm=10_000)
    state.increment_tpm(5_000)
    assert state.tpm_available() is True
    state.increment_tpm(6_000)  # total 11000, over cap
    assert state.tpm_available() is False


# ---------------------------------------------------------------------------
# Window remaining
# ---------------------------------------------------------------------------


def test_tpm_window_remaining_seconds_fresh_window():
    state = _make_state(max_tpm=100)
    state.increment_tpm(10)  # initializes window
    remaining = state.tpm_window_remaining_seconds()
    assert 50 < remaining <= 60


def test_tpm_window_remaining_seconds_zero_after_window_elapsed():
    state = _make_state(max_tpm=100)
    state.token_window_start = time.monotonic() - 120
    assert state.tpm_window_remaining_seconds() == 0


# ---------------------------------------------------------------------------
# Registry filtering when tpm_enforced
# ---------------------------------------------------------------------------


def _make_registry() -> ProviderRegistry:
    """Build a registry with two providers — one TPM-saturated, one open."""
    reg = ProviderRegistry()
    reg._providers = {
        'saturated': ProviderState(config=ProviderConfig(
            name='saturated', base_url='http://x', api_key='k',
            models={'default': 'm'}, priority=1, max_tpm=1000,
        )),
        'open': ProviderState(config=ProviderConfig(
            name='open', base_url='http://x', api_key='k',
            models={'default': 'm'}, priority=2, max_tpm=10000,
        )),
    }
    reg._initialized = True
    reg._providers['saturated'].increment_tpm(1000)  # at cap
    return reg


def test_available_providers_filters_tpm_saturated_when_enforced():
    reg = _make_registry()
    with patch('app.services.llm.registry.get_settings') as mock_s:
        mock_s.return_value.tpm_enforced = True
        available = reg._available_providers()
    names = [s.config.name for s in available]
    assert 'saturated' not in names
    assert 'open' in names


def test_available_providers_keeps_saturated_when_not_enforced():
    """Default (tpm_enforced=False) does NOT filter — TPM is tracked but
    not gating. Lets dashboards see the numbers without breaking traffic."""
    reg = _make_registry()
    with patch('app.services.llm.registry.get_settings') as mock_s:
        mock_s.return_value.tpm_enforced = False
        available = reg._available_providers()
    names = [s.config.name for s in available]
    assert 'saturated' in names
    assert 'open' in names


# ---------------------------------------------------------------------------
# _invoke_with_circuit raises 429 with Retry-After when TPM blocked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoke_with_circuit_raises_tpm_429_when_enforced_and_at_cap():
    """When tpm_enforced=True AND provider is at TPM cap, the gateway
    raises HTTP 429 with TPM_BUDGET_EXCEEDED code + Retry-After header.

    This is the load-bearing test: without it, a long-context abuser
    could blow past the per-provider cap and the next user gets vendor
    429s with no Retry-After hint.
    """
    from fastapi import HTTPException
    from app.services.llm import circuit_fallback as cf

    saturated = ProviderState(config=ProviderConfig(
        name='glm', base_url='http://x', api_key='k',
        models={'default': 'glm-4.7-flash'}, priority=1, max_tpm=1000,
    ))
    saturated.increment_tpm(1000)

    class _FakeReg:
        def get_provider(self, feature=None):
            return saturated
        def record_latency(self, *a, **kw):
            pass

    fake_settings = type('S', (), {
        'llm_daily_token_budget': 0,
        'tpm_enforced': True,
    })()

    with patch('app.config.get_settings', return_value=fake_settings), \
         patch('app.services.llm.registry.get_registry', return_value=_FakeReg()), \
         patch('app.middleware.daily_llm_budget.estimate_input_tokens', return_value=500), \
         patch.object(cf, '_invoke_with_retry') as mock_retry:
        with pytest.raises(HTTPException) as exc_info:
            await cf._invoke_with_circuit(
                messages=[], log_label='test', feature='companion',
            )

    assert exc_info.value.status_code == 429
    detail = exc_info.value.detail
    assert detail['code'] == 'TPM_BUDGET_EXCEEDED'
    assert detail['provider'] == 'glm'
    # Retry-After must be present and a positive integer
    retry_after = exc_info.value.headers.get('Retry-After')
    assert retry_after is not None
    assert int(retry_after) > 0
    # The vendor was NOT called — fail-fast before retry.
    assert not mock_retry.called


@pytest.mark.asyncio
async def test_invoke_with_circuit_skips_tpm_check_when_not_enforced():
    """Default (tpm_enforced=False) — even an at-cap provider is allowed
    through. TPM is tracked but not gating until ops explicitly flips."""
    from app.services.llm import circuit_fallback as cf
    from unittest.mock import AsyncMock

    saturated = ProviderState(config=ProviderConfig(
        name='glm', base_url='http://x', api_key='k',
        models={'default': 'glm-4.7-flash'}, priority=1, max_tpm=1000,
    ))
    saturated.increment_tpm(1000)  # at cap

    class _FakeReg:
        def get_provider(self, feature=None):
            return saturated
        def record_latency(self, *a, **kw):
            pass

    fake_settings = type('S', (), {
        'llm_daily_token_budget': 0,
        'tpm_enforced': False,
    })()

    fake_response = type('R', (), {'response_metadata': {}})()

    with patch('app.config.get_settings', return_value=fake_settings), \
         patch('app.services.llm.registry.get_registry', return_value=_FakeReg()), \
         patch('app.services.llm.circuit_fallback._invoke_with_retry', new=AsyncMock(return_value=fake_response)), \
         patch('app.services.llm.pool.get_llm'), \
         patch('app.services.llm.circuit_fallback._record_success', new=AsyncMock()):
        response = await cf._invoke_with_circuit(
            messages=[], log_label='test', feature='companion',
        )

    assert response is fake_response


# Need re for the Retry-After int() parse
import re  # noqa: E402
