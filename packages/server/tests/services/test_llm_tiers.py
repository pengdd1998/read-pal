"""Call tiers and the configuration-error circuit cooldown (P9.1 / P9.3).

P9.1: a provider whose model the vendor had retired kept taking its routing
share for four weeks — the breaker re-probed it every reset timeout.
P9.3: auxiliary calls (query expansion, tool planning) ran on the reasoning
default, where "extract keywords" cost 14s and returned an empty string.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from langchain_core.messages import HumanMessage

from app.config import ProviderConfig, Settings
from app.services.llm import circuit_fallback, provider_fallback, retry
from app.services.llm.circuit_breaker import CircuitBreaker, CircuitState
from app.services.llm.registry import ProviderRegistry, reset_registry
from openai import RateLimitError

from app.services.llm.tiers import (
    call_in_tier,
    disable_thinking_for,
    fast_model,
    is_config_error,
    is_rate_limited,
    is_timeout,
    model_for,
)

_GLM = 'https://open.bigmodel.cn/api/paas/v4'
_MODELS = {'default': 'big', 'fallback': 'small'}


def _cfg(name='glm', base_url=_GLM, models=None, priority=1):
    return ProviderConfig(name=name, base_url=base_url, api_key=f'k-{name}',
                          models=dict(models or _MODELS), priority=priority)


class _VendorError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


class TestModelResolution:
    def test_explicit_fast_wins_then_fallback_then_default(self):
        assert fast_model(_cfg(models={**_MODELS, 'fast': 'tiny'})) == 'tiny'
        assert fast_model(_cfg()) == 'small'
        assert fast_model(_cfg(models={'default': 'only'})) == 'only'

    @pytest.mark.asyncio
    async def test_tier_is_scoped_to_the_call(self):
        cfg = _cfg()
        assert model_for(cfg) == 'big'

        async def probe():
            return model_for(cfg)

        assert await call_in_tier('fast', probe) == 'small'
        assert model_for(cfg) == 'big', 'tier must not leak past the call'

    @pytest.mark.asyncio
    async def test_tier_resets_after_an_exception(self):
        async def boom():
            raise RuntimeError('vendor down')

        with pytest.raises(RuntimeError):
            await call_in_tier('fast', boom)
        assert model_for(_cfg()) == 'big'

    @pytest.mark.asyncio
    async def test_concurrent_calls_keep_their_own_tiers(self):
        cfg, seen = _cfg(), []

        async def probe(label, delay):
            await asyncio.sleep(delay)
            seen.append((label, model_for(cfg)))

        await asyncio.gather(
            call_in_tier('fast', probe, label='fast', delay=0.02),
            call_in_tier('default', probe, label='default', delay=0.01),
        )
        assert dict(seen) == {'fast': 'small', 'default': 'big'}


async def _toggle(config):
    return disable_thinking_for(config)


class TestThinkingToggle:
    @pytest.mark.asyncio
    @pytest.mark.parametrize('base_url', [
        _GLM, 'https://api.z.ai/api/paas/v4', 'https://open.bigmodel.cn/coding/paas/v4',
    ])
    async def test_fast_tier_disables_thinking_on_supporting_vendors(self, base_url):
        assert await call_in_tier('fast', _toggle, config=_cfg(base_url=base_url)) is True

    @pytest.mark.asyncio
    async def test_unknown_vendors_get_no_extra_field(self):
        other = _cfg(base_url='https://api.other.test/v1')
        assert await call_in_tier('fast', _toggle, config=other) is False

    @pytest.mark.asyncio
    async def test_default_tier_never_disables_thinking(self):
        assert await call_in_tier('default', _toggle, config=_cfg()) is False


class TestConfigErrorClassification:
    @pytest.mark.parametrize('status,message', [
        (401, 'invalid api key'), (403, 'forbidden'),
        (400, "Unsupported model mimo-v2.5"), (404, 'Model not found'),
    ])
    def test_auth_and_retired_model_are_config_errors(self, status, message):
        assert is_config_error(_VendorError(status, message)) is True

    @pytest.mark.parametrize('exc', [
        _VendorError(400, 'context length exceeded'),
        _VendorError(429, 'rate limit reached'),
        _VendorError(500, 'internal error'),
        RuntimeError('no status at all'),
    ])
    def test_request_specific_and_transient_errors_are_not(self, exc):
        assert is_config_error(exc) is False


class TestConfigErrorCooldown:
    @pytest.fixture
    def breaker(self):
        clock = {'t': 1000.0}
        settings = SimpleNamespace(circuit_reset_timeout_seconds=30, circuit_failure_threshold=5,
                                   circuit_config_error_timeout_seconds=600)
        with patch('app.services.llm.circuit_breaker.get_settings', return_value=settings), \
             patch('app.services.llm.circuit_breaker.time', SimpleNamespace(monotonic=lambda: clock['t'])):
            br = CircuitBreaker('glm')
            yield br, clock

    @pytest.mark.asyncio
    async def test_trips_below_the_failure_threshold(self, breaker):
        br, _ = breaker
        await br.record_failure(config_error=True)
        assert br.state is CircuitState.OPEN
        assert await br.allow_request() is False

    @pytest.mark.asyncio
    async def test_outlives_the_ordinary_reset_timeout(self, breaker):
        br, clock = breaker
        await br.record_failure(config_error=True)
        clock['t'] += 31  # a normal trip would already allow a probe here
        assert br.is_open is True
        assert await br.allow_request() is False

    @pytest.mark.asyncio
    async def test_one_probe_after_the_cooldown_then_closed_on_success(self, breaker):
        br, clock = breaker
        await br.record_failure(config_error=True)
        clock['t'] += 601
        assert br.is_open is False, 'selection must re-include the provider for a probe'
        assert await br.allow_request() is True
        assert await br.allow_request() is False, 'half-open allows a single probe'
        await br.record_success()
        assert br.state is CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_failed_probe_restarts_the_long_cooldown(self, breaker):
        br, clock = breaker
        await br.record_failure(config_error=True)
        clock['t'] += 601
        assert await br.allow_request() is True
        await br.record_failure(config_error=True)
        clock['t'] += 31
        assert br.is_open is True

    @pytest.mark.asyncio
    async def test_ordinary_failures_keep_threshold_and_short_reset(self, breaker):
        br, clock = breaker
        await br.record_failure()
        assert br.state is CircuitState.CLOSED, 'one failure is below the threshold'
        for _ in range(4):
            await br.record_failure()
        assert br.state is CircuitState.OPEN
        clock['t'] += 31
        assert br.is_open is False, 'overload trips still recover on the short timeout'

    @pytest.mark.asyncio
    async def test_success_clears_the_override(self, breaker):
        br, clock = breaker
        await br.record_failure(config_error=True)
        await br.record_success()
        for _ in range(5):
            await br.record_failure()
        clock['t'] += 31
        assert br.is_open is False


class TestPoolThinkingToggle:
    def _pool(self, cfg, disable_thinking):
        state = MagicMock()
        state.config = cfg
        state.pool = {}
        registry = MagicMock()
        registry.get_provider_by_name.return_value = state
        settings = SimpleNamespace(llm_max_retries=2, llm_timeout_seconds=15)
        with patch('app.services.llm.registry.get_registry', return_value=registry), \
             patch('app.services.llm.pool.get_settings', return_value=settings), \
             patch('app.services.llm.pool.ChatOpenAI') as client:
            from app.services.llm.pool import get_llm
            get_llm(provider=cfg.name, model='small', disable_thinking=disable_thinking)
        return client.call_args.kwargs, state.pool

    def test_sends_the_thinking_flag_to_a_supporting_vendor(self):
        kwargs, _ = self._pool(_cfg(), True)
        assert kwargs['extra_body'] == {'thinking': {'type': 'disabled'}}

    def test_omits_it_when_not_requested_or_unsupported(self):
        assert 'extra_body' not in self._pool(_cfg(), False)[0]
        assert 'extra_body' not in self._pool(_cfg(base_url='https://api.other.test/v1'), True)[0]

    def test_flag_is_part_of_the_pool_key(self):
        state = MagicMock()
        state.config = _cfg()
        state.pool = {}
        registry = MagicMock()
        registry.get_provider_by_name.return_value = state
        settings = SimpleNamespace(llm_max_retries=2, llm_timeout_seconds=15)
        with patch('app.services.llm.registry.get_registry', return_value=registry), \
             patch('app.services.llm.pool.get_settings', return_value=settings), \
             patch('app.services.llm.pool.ChatOpenAI') as client:
            from app.services.llm.pool import get_llm
            get_llm(provider='glm')
            get_llm(provider='glm', disable_thinking=True)
            get_llm(provider='glm', disable_thinking=True)
        assert len(state.pool) == 2, 'thinking on/off must not share one client'
        assert client.call_count == 2


class TestInvokeUsesTheTier:
    @pytest.fixture
    def wired(self):
        state = MagicMock()
        state.config = _cfg()
        state.circuit.allow_request = AsyncMock(return_value=True)
        registry = MagicMock()
        registry.get_provider.return_value = state
        with patch('app.services.llm.registry.get_registry', return_value=registry), \
             patch('app.services.llm.pool.get_llm', return_value=object()) as get_llm, \
             patch.object(circuit_fallback, '_invoke_with_retry',
                          new=AsyncMock(return_value=SimpleNamespace(content='ok'))), \
             patch.object(circuit_fallback, '_record_success', new=AsyncMock()) as recorded, \
             patch('app.services.llm.observability.capture_llm_content', MagicMock()):
            yield get_llm, recorded

    @pytest.mark.asyncio
    async def test_default_tier_uses_the_provider_default(self, wired):
        get_llm, recorded = wired
        from app.services.llm.safe_invoke import safe_llm_call
        assert await safe_llm_call([HumanMessage(content='hi')], use_cache=False) == 'ok'
        assert get_llm.call_args.kwargs == {
            'provider': 'glm', 'disable_thinking': False, 'structured_output': False,
        }
        assert recorded.call_args.kwargs['model_used'] == 'big'

    @pytest.mark.asyncio
    async def test_fast_tier_uses_the_quick_model_without_thinking(self, wired):
        get_llm, recorded = wired
        from app.services.llm.safe_invoke import safe_llm_call
        assert await safe_llm_call([HumanMessage(content='hi')], use_cache=False, tier='fast') == 'ok'
        assert get_llm.call_args.kwargs == {
            'provider': 'glm', 'disable_thinking': True, 'model': 'small',
            'structured_output': False,
        }
        assert recorded.call_args.kwargs['model_used'] == 'small'


class TestSameProviderHop:
    """After the primary fails: next provider, then the same provider's
    fallback model — unless that IS the model which just failed."""

    async def _hops_after_a_failed_primary(self, cfg, tier):
        state = MagicMock()
        state.config = cfg
        state.circuit.allow_request = AsyncMock(return_value=True)
        registry = MagicMock()
        registry.get_provider.return_value = state
        with patch('app.services.llm.registry.get_registry', return_value=registry), \
             patch('app.services.llm.pool.get_llm', return_value=object()), \
             patch.object(circuit_fallback, '_invoke_with_retry',
                          new=AsyncMock(side_effect=RuntimeError('down'))), \
             patch.object(circuit_fallback, '_record_failure', new=AsyncMock()), \
             patch.object(circuit_fallback, '_record_success', new=AsyncMock()), \
             patch.object(circuit_fallback, '_try_next_provider', new=AsyncMock(return_value=None)), \
             patch.object(circuit_fallback, '_try_same_provider_fallback',
                          new=AsyncMock(return_value=None)) as same_model, \
             patch('app.services.llm.observability.capture_llm_content', MagicMock()):
            from app.services.llm.safe_invoke import safe_llm_call
            await safe_llm_call([HumanMessage(content='hi')], use_cache=False, tier=tier)
        return same_model.await_count

    @pytest.mark.asyncio
    async def test_default_tier_hops_to_the_fallback_model(self):
        assert await self._hops_after_a_failed_primary(_cfg(), 'default') == 1

    @pytest.mark.asyncio
    async def test_fast_tier_does_not_retry_the_model_that_just_failed(self):
        """fast == fallback here, so the hop would repeat the same request."""
        assert await self._hops_after_a_failed_primary(_cfg(), 'fast') == 0

    @pytest.mark.asyncio
    async def test_fast_tier_hops_when_the_fallback_is_a_different_model(self):
        assert await self._hops_after_a_failed_primary(_cfg(models={**_MODELS, 'fast': 'tiny'}), 'fast') == 1


class TestFailureRecording:
    @pytest.mark.asyncio
    @pytest.mark.parametrize('message,opens', [
        ('Unsupported model mimo-v2.5', True),
        ('rate limit reached', False),
    ])
    async def test_only_config_errors_trip_the_breaker_immediately(self, message, opens):
        state = MagicMock()
        state.config = _cfg()
        state.circuit = CircuitBreaker('glm')
        settings = SimpleNamespace(circuit_reset_timeout_seconds=30, circuit_failure_threshold=5,
                                   circuit_config_error_timeout_seconds=600)
        with patch('app.services.llm.circuit_breaker.get_settings', return_value=settings), \
             patch('app.services.llm.observability._log_call'):
            await provider_fallback._record_failure(
                state=state, provider_name='glm', registry=MagicMock(), request_id='r',
                model_used='big', log_label='L', start=0.0,
                exc=_VendorError(400, message), user_id=None, book_id=None,
            )
        assert state.circuit.is_open is opens


@pytest.fixture(autouse=True)
def _clean_registry():
    reset_registry()
    yield
    reset_registry()


class TestRegistryStopsRoutingToARetiredModel:
    def test_a_provider_in_config_cooldown_gets_no_picks(self):
        configs = [_cfg('glm'), _cfg('mimo', base_url='https://api.other.test/v1',
                                     models={'default': 'mimo-v2.5'}, priority=2)]
        settings = SimpleNamespace(provider_configs=configs, tpm_enforced=False, feature_routing={})
        with patch('app.services.llm.registry.get_settings', return_value=settings):
            reg = ProviderRegistry()
            reg.initialize()
            before = {reg.get_provider().config.name for _ in range(200)}
            assert before == {'glm', 'mimo'}, 'the retired provider must be pickable first'

            asyncio.run(reg.get_provider_by_name('mimo').circuit.record_failure(config_error=True))

            after = {reg.get_provider().config.name for _ in range(200)}
        assert after == {'glm'}


class TestDefaults:
    def test_the_tool_planner_is_no_longer_pinned_to_a_named_vendor(self):
        assert Settings.model_fields['llm_feature_routing'].default == '{}'

    def test_query_expansion_is_opt_in_and_the_planner_deadline_tightened(self):
        assert Settings.model_fields['rag_query_expansion_enabled'].default is False
        assert Settings.model_fields['companion_tool_plan_timeout_ms'].default == 5000


class TestClientRetries:
    """The openai SDK retries 429s on its own. For callers that own a fallback
    chain that is seconds of silent waiting before the chain can hop."""

    def _retries(self, cfg, **kwargs):
        state = MagicMock()
        state.config = cfg
        state.pool = {}
        registry = MagicMock()
        registry.get_provider_by_name.return_value = state
        settings = SimpleNamespace(llm_max_retries=2, llm_timeout_seconds=15)
        with patch('app.services.llm.registry.get_registry', return_value=registry), \
             patch('app.services.llm.pool.get_settings', return_value=settings), \
             patch('app.services.llm.pool.ChatOpenAI') as client:
            from app.services.llm.pool import get_llm
            get_llm(provider=cfg.name, **kwargs)
        return client.call_args.kwargs['max_retries']

    def test_ordinary_calls_keep_the_configured_retries(self):
        assert self._retries(_cfg()) == 2

    @pytest.mark.asyncio
    async def test_the_fast_tier_gets_none(self):
        async def probe():
            return self._retries(_cfg())
        assert await call_in_tier('fast', probe) == 0

    def test_a_chain_owner_can_opt_out_explicitly(self):
        assert self._retries(_cfg(), max_retries=0) == 0

    @pytest.mark.asyncio
    async def test_retry_count_is_part_of_the_pool_key(self):
        state = MagicMock()
        state.config = _cfg()
        state.pool = {}
        registry = MagicMock()
        registry.get_provider_by_name.return_value = state
        settings = SimpleNamespace(llm_max_retries=2, llm_timeout_seconds=15)
        with patch('app.services.llm.registry.get_registry', return_value=registry), \
             patch('app.services.llm.pool.get_settings', return_value=settings), \
             patch('app.services.llm.pool.ChatOpenAI'):
            from app.services.llm.pool import get_llm
            get_llm(provider='glm')
            get_llm(provider='glm', max_retries=0)
        assert len(state.pool) == 2


class TestRateLimitClassification:
    def test_only_a_429_is_a_rate_limit(self):
        assert is_rate_limited(_VendorError(429, 'rate limit')) is True
        assert is_rate_limited(_VendorError(503, 'overloaded')) is False
        assert is_rate_limited(RuntimeError('no status')) is False


class TestFastTierSkipsTheBackoffLadder:
    @pytest.mark.asyncio
    @pytest.mark.parametrize('tier,attempts', [('default', 3), ('fast', 1)])
    async def test_only_the_default_tier_waits_between_attempts(self, tier, attempts):
        calls, sleeps = [], []

        class Limited:
            async def ainvoke(self, messages):
                calls.append(1)
                raise RateLimitError(
                    'rate limited', body=None,
                    response=httpx.Response(429, request=httpx.Request('POST', 'https://vendor.test/v1')),
                )

        async def no_sleep(seconds):
            sleeps.append(seconds)

        with patch.object(retry.asyncio, 'sleep', no_sleep):
            with pytest.raises(RateLimitError):
                await call_in_tier(tier, retry._invoke_with_retry, llm=Limited(), messages=[], log_label='L')
        assert len(calls) == attempts
        assert sleeps == ([5, 15] if tier == 'default' else [])


class TestTimeoutClassification:
    def test_sdk_and_httpx_timeouts_are_recognized_by_name(self):
        for name in ('APITimeoutError', 'ReadTimeout', 'ConnectTimeout', 'TimeoutException'):
            exc = type(name, (Exception,), {})('timed out')
            assert is_timeout(exc) is True, name
        assert is_timeout(TimeoutError()) is True  # asyncio.TimeoutError is the same class

    def test_a_refusal_is_not_a_timeout(self):
        assert is_timeout(_VendorError(429, 'rate limit')) is False
        assert is_timeout(RuntimeError('no status')) is False

    def test_an_explicit_request_timeout_reaches_the_vendor_client(self):
        state = MagicMock()
        state.config = _cfg()
        state.pool = {}
        registry = MagicMock()
        registry.get_provider_by_name.return_value = state
        settings = SimpleNamespace(llm_max_retries=2, llm_timeout_seconds=15)
        with patch('app.services.llm.registry.get_registry', return_value=registry), \
             patch('app.services.llm.pool.get_settings', return_value=settings), \
             patch('app.services.llm.pool.ChatOpenAI') as client:
            from app.services.llm.pool import get_llm
            get_llm(provider='glm')
            get_llm(provider='glm', request_timeout=6.0)
        assert [c.kwargs['request_timeout'] for c in client.call_args_list] == [15, 6.0]
        assert len(state.pool) == 2

    def test_stream_calls_default_to_six_seconds(self):
        from app.config import Settings
        assert Settings.model_fields['llm_stream_timeout_seconds'].default == 6.0
