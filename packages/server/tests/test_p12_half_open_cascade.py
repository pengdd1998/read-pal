"""P1.2 tests: HALF_OPEN cascade to next provider.

Validates that:
1. A HALF_OPEN provider with probe in flight is excluded from
   _available_providers so callers cascade instead of failing.
2. _try_next_provider terminates cleanly when all providers are
   unavailable (no infinite recursion).
3. The is_probe_in_flight property correctly identifies the state.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.llm.circuit_breaker import CircuitBreaker, CircuitState


class TestCircuitBreakerProbeInFlight:
    """P1.2: is_probe_in_flight correctly identifies unavailable state."""

    @pytest.mark.asyncio
    async def test_half_open_with_probe_is_in_flight(self):
        cb = CircuitBreaker()
        # Drive to HALF_OPEN with probe in flight
        cb.state = CircuitState.HALF_OPEN
        cb._probe_in_progress = True
        assert cb.is_probe_in_flight is True

    @pytest.mark.asyncio
    async def test_half_open_without_probe_not_in_flight(self):
        cb = CircuitBreaker()
        cb.state = CircuitState.HALF_OPEN
        cb._probe_in_progress = False
        assert cb.is_probe_in_flight is False

    @pytest.mark.asyncio
    async def test_closed_not_in_flight(self):
        cb = CircuitBreaker()
        cb.state = CircuitState.CLOSED
        assert cb.is_probe_in_flight is False

    @pytest.mark.asyncio
    async def test_open_not_in_flight(self):
        """OPEN providers are filtered by is_open, not is_probe_in_flight."""
        import time
        cb = CircuitBreaker()
        cb.state = CircuitState.OPEN
        cb._opened_at = time.monotonic()
        assert cb.is_probe_in_flight is False  # is_open handles this case


class TestRegistryExcludesProbeInFlight:
    """P1.2: _available_providers skips HALF_OPEN-with-probe."""

    def test_half_open_with_probe_excluded(self):
        from app.services.llm.registry import ProviderRegistry, ProviderState
        from app.config import ProviderConfig

        registry = ProviderRegistry()

        # Provider A: HALF_OPEN with probe in flight
        cfg_a = ProviderConfig(
            name='A', base_url='http://a', api_key='k',
            models={'default': 'm'}, priority=1,
        )
        state_a = ProviderState(config=cfg_a)
        state_a.circuit.state = CircuitState.HALF_OPEN
        state_a.circuit._probe_in_progress = True

        # Provider B: closed (available)
        cfg_b = ProviderConfig(
            name='B', base_url='http://b', api_key='k',
            models={'default': 'm'}, priority=2,
        )
        state_b = ProviderState(config=cfg_b)

        registry._providers = {'A': state_a, 'B': state_b}
        registry._initialized = True

        available = registry._available_providers()
        names = [s.config.name for s in available]
        assert 'A' not in names, 'HALF_OPEN with probe must be excluded'
        assert 'B' in names

    def test_all_providers_half_open_returns_empty(self):
        """When every provider is probe-locked, available is empty.

        This is the precondition for the original infinite-recursion bug.
        """
        from app.services.llm.registry import ProviderRegistry, ProviderState
        from app.config import ProviderConfig

        registry = ProviderRegistry()

        cfg_a = ProviderConfig(
            name='A', base_url='http://a', api_key='k',
            models={'default': 'm'}, priority=1,
        )
        cfg_b = ProviderConfig(
            name='B', base_url='http://b', api_key='k',
            models={'default': 'm'}, priority=2,
        )
        cfg_c = ProviderConfig(
            name='C', base_url='http://c', api_key='k',
            models={'default': 'm'}, priority=3,
        )
        state_a = ProviderState(config=cfg_a)
        state_b = ProviderState(config=cfg_b)
        state_c = ProviderState(config=cfg_c)
        for s in (state_a, state_b, state_c):
            s.circuit.state = CircuitState.HALF_OPEN
            s.circuit._probe_in_progress = True

        registry._providers = {'A': state_a, 'B': state_b, 'C': state_c}
        registry._initialized = True

        assert registry._available_providers() == []
        assert registry.next_provider_after('A') is None
        assert registry.next_provider_after('B') is None
        assert registry.next_provider_after('C') is None


class TestTryNextProviderTerminatesOnCycle:
    """P1.2: _try_next_provider terminates instead of infinite recursion."""

    @pytest.mark.asyncio
    async def test_cascade_terminates_when_all_providers_unavailable(self):
        """Original bug: cycling through all HALF_OPEN providers infinitely.

        With the fix, _try_next_provider returns None cleanly when no
        provider accepts the request.
        """
        from app.services.llm import provider_fallback

        # Build a fake registry where next_provider_after always returns
        # a provider whose allow_request() returns False. This simulates
        # the all-HALF_OPEN-with-probe state without depending on the
        # registry fix (defense-in-depth).
        state_a = MagicMock()
        state_a.config.name = 'A'
        state_a.config.default_model = 'm'
        state_a.circuit.allow_request = AsyncMock(return_value=False)
        state_a.circuit.record_failure = AsyncMock()
        state_a.circuit.record_success = AsyncMock()

        state_b = MagicMock()
        state_b.config.name = 'B'
        state_b.config.default_model = 'm'
        state_b.circuit.allow_request = AsyncMock(return_value=False)
        state_b.circuit.record_failure = AsyncMock()
        state_b.circuit.record_success = AsyncMock()

        state_c = MagicMock()
        state_c.config.name = 'C'
        state_c.config.default_model = 'm'
        state_c.circuit.allow_request = AsyncMock(return_value=False)
        state_c.circuit.record_failure = AsyncMock()
        state_c.circuit.record_success = AsyncMock()

        registry = MagicMock()
        # Cycle: A → B → C → A → B → C → ... (would loop forever without guard)
        cycling = {'A': state_b, 'B': state_c, 'C': state_a}
        registry.next_provider_after = lambda name: cycling.get(name)

        # The recursive call should terminate, NOT raise RecursionError
        result = await provider_fallback._try_next_provider(
            messages=[], registry=registry, failed_provider='A',
            request_id='req1', log_label='TEST', start_time=0.0,
        )

        # Without the visited-set guard, this would have raised RecursionError
        assert result is None
