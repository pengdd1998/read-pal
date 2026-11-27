"""Companion stream fallback chain (P9.1 / P9.2).

The chain used to hop PROVIDERS only. With a single healthy provider it
re-selected the very model that had just returned 429 and failed the turn a
second time; and a provider whose model the vendor retired stayed in
rotation because the breaker re-probed it within seconds.
"""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from app.services.llm.circuit_breaker import CircuitBreaker
from app.services.companion import stream_cooldown, stream_fallback, stream_provider

_UID, _BID = UUID(int=1), UUID(int=2)
_ERROR_TEXT = "I'm having trouble connecting to my AI service"


@pytest.fixture(autouse=True)
def _no_cooldowns():
    stream_cooldown.reset()
    yield
    stream_cooldown.reset()


class _Dead:
    async def astream(self, messages):
        raise RuntimeError('dead')
        yield  # pragma: no cover — makes this an async generator


class _Text:
    def __init__(self, text):
        self.text = text

    async def astream(self, messages):
        yield SimpleNamespace(content=self.text)


class _PartialThenDead:
    """Emits fewer chunks than one flush batch, then dies: collected but never shown."""

    async def astream(self, messages):
        yield SimpleNamespace(content='partial ')
        raise RuntimeError('died before flush')


class _ShownThenDead:
    """Emits a full flush batch, then dies: the reader has seen this text."""

    async def astream(self, messages):
        for _ in range(50):
            yield SimpleNamespace(content='shown ')
        raise RuntimeError('died mid-stream')


def _state(name, default, fallback=None, allow=True):
    return SimpleNamespace(
        config=SimpleNamespace(name=name, default_model=default, fallback_model=fallback),
        circuit=SimpleNamespace(
            allow_request=AsyncMock(return_value=allow),
            record_failure=AsyncMock(),
            record_success=AsyncMock(),
        ),
    )


def _registry_lookup(*states):
    by_name = {s.config.name: s for s in states}
    return SimpleNamespace(get_provider_by_name=lambda name: by_name.get(name))


async def _stream(primary, *, fallback_llms, resolve=None, lookup=None):
    """Drive one primary attempt (always failing) plus its fallback chain."""
    collected, chunks = [], []
    with patch.object(stream_provider, 'get_llm', return_value=_Dead()), \
         patch.object(stream_provider, '_handle_stream_failure', new=AsyncMock()), \
         patch('app.services.companion.stream_fallback.get_llm', side_effect=fallback_llms) as fb_llm, \
         patch('app.services.companion.stream_fallback.get_registry',
               return_value=_registry_lookup(primary, *(lookup or []))), \
         patch('app.services.companion.stream_fallback.resolve_fallback_provider', return_value=resolve), \
         patch('app.services.companion.stream_fallback.quick_safety_check', return_value=True):
        async for chunk in stream_provider._stream_from_provider(
            state=primary, provider_name=primary.config.name,
            model_used=primary.config.default_model, messages=[],
            collected_parts=collected, request_id='req-1', start_time=0.0,
            user_id=_UID, book_id=_BID, lang='en', cancelled=asyncio.Event(),
        ):
            chunks.append(chunk)
    return chunks, collected, fb_llm


def _frames(chunks, key):
    return [json.loads(c[len('data: '):-2])[key] for c in chunks
            if c.startswith('data: ') and f'"{key}"' in c]


class TestSameProviderFallbackModelGoesFirst:
    @pytest.mark.asyncio
    async def test_the_smaller_sibling_answers_before_any_other_provider(self):
        glm = _state('glm', 'big', fallback='small')
        other = _state('deepseek', 'deepseek-chat')
        chunks, collected, fb_llm = await _stream(glm, fallback_llms=[_Text('from small')],
                                                  resolve=other, lookup=[other])

        assert fb_llm.call_args.kwargs['model'] == 'small'
        assert fb_llm.call_args.kwargs['provider'] == 'glm'
        assert collected == ['from small']
        assert _frames(chunks, 'content') == ['from small']
        assert other.circuit.allow_request.await_count == 0, 'no need to leave the provider'

    @pytest.mark.asyncio
    async def test_the_metadata_event_names_the_model_that_answers(self):
        glm = _state('glm', 'big', fallback='small')
        chunks, _, _ = await _stream(glm, fallback_llms=[_Text('from small')])
        meta = next(c for c in chunks if '"type": "metadata"' in c)
        payload = json.loads(meta[len('data: '):-2])
        assert payload['fallback_used'] is True
        assert payload['model'] == 'small'
        assert payload['primary_model'] == 'big'
        assert payload['primary_provider'] == 'glm'
        assert chunks.index(meta) == 0, 'the downgrade notice precedes the fallback text'

    @pytest.mark.asyncio
    async def test_no_hop_when_the_provider_has_no_fallback_model(self):
        glm = _state('glm', 'big')
        chunks, _, fb_llm = await _stream(glm, fallback_llms=[_Text('unused')])
        assert fb_llm.call_count == 0
        assert _frames(chunks, 'type') == [] and _ERROR_TEXT in ''.join(chunks)


class TestChainAdvancesOnlyWhileNothingWasShown:
    @pytest.mark.asyncio
    async def test_a_hop_failing_before_output_hands_over_to_the_next(self):
        glm = _state('glm', 'big', fallback='small')
        other = _state('deepseek', 'deepseek-chat')
        chunks, collected, fb_llm = await _stream(
            glm, fallback_llms=[_Dead(), _Text('from deepseek')], resolve=other, lookup=[other],
        )
        assert _frames(chunks, 'model') == ['small', 'deepseek-chat']
        assert collected == ['from deepseek']
        assert glm.circuit.record_failure.await_count == 1
        assert other.circuit.record_success.await_count == 1

    @pytest.mark.asyncio
    async def test_text_collected_but_never_shown_is_not_carried_over(self):
        """Flush-batched output: a hop can die with text the reader never saw.
        It must not be glued onto the next hop's answer in the saved message."""
        glm = _state('glm', 'big', fallback='small')
        other = _state('deepseek', 'deepseek-chat')
        chunks, collected, fb_llm = await _stream(
            glm, fallback_llms=[_PartialThenDead(), _Text('from deepseek')],
            resolve=other, lookup=[other],
        )
        assert fb_llm.call_count == 2, 'nothing was shown, so the chain advances'
        assert _frames(chunks, 'content') == ['from deepseek']
        assert collected == ['from deepseek']

    @pytest.mark.asyncio
    async def test_a_hop_dying_after_showing_text_stops_the_chain(self):
        """A fresh hop's answer would be glued onto what the reader already saw."""
        glm = _state('glm', 'big', fallback='small')
        other = _state('deepseek', 'deepseek-chat')
        chunks, collected, fb_llm = await _stream(
            glm, fallback_llms=[_ShownThenDead()], resolve=other, lookup=[other],
        )
        assert fb_llm.call_count == 1
        contents = _frames(chunks, 'content')
        assert _ERROR_TEXT in contents.pop()  # the trailing error frame
        shown = ''.join(contents)
        assert shown and set(shown.split()) == {'shown'}
        assert ''.join(collected) == shown, 'the saved text is exactly what was shown'
        assert _ERROR_TEXT in chunks[-1]
        assert glm.circuit.record_failure.await_count == 1

    @pytest.mark.asyncio
    async def test_no_candidate_leaves_a_single_error_chunk(self):
        glm = _state('glm', 'big')
        chunks, _, _ = await _stream(glm, fallback_llms=[])
        assert len(chunks) == 1 and _ERROR_TEXT in chunks[0]

    @pytest.mark.asyncio
    async def test_hops_with_an_open_circuit_are_skipped(self):
        """Primary circuit-blocked: its own fallback model is blocked too."""
        glm = _state('glm', 'big', fallback='small', allow=False)
        other = _state('deepseek', 'deepseek-chat')
        chunks, _, fb_llm = await _stream(glm, fallback_llms=[_Text('from deepseek')],
                                          resolve=other, lookup=[other])
        assert fb_llm.call_args.kwargs['model'] == 'deepseek-chat'
        assert _frames(chunks, 'model') == ['deepseek-chat']


class TestStreamFailureRecording:
    @pytest.mark.asyncio
    @pytest.mark.parametrize('message,opens', [
        ('Unsupported model mimo-v2.5', True),
        ('Your account has reached the rate limit', False),
    ])
    async def test_a_retired_model_parks_the_provider(self, message, opens):
        state = SimpleNamespace(config=SimpleNamespace(name='mimo'), circuit=CircuitBreaker('mimo'))
        settings = SimpleNamespace(circuit_reset_timeout_seconds=30, circuit_failure_threshold=5,
                                   circuit_config_error_timeout_seconds=600)
        exc = type('VendorError', (Exception,), {'status_code': 400})(message)
        with patch('app.services.llm.circuit_breaker.get_settings', return_value=settings), \
             patch('app.services.companion.safety.persist_stream_log'), \
             patch('app.services.llm.registry.get_registry', return_value=MagicMock()):
            await stream_provider._handle_stream_failure(
                exc, state, 'mimo', 'mimo-v2.5', 'req-1', 0.0, _UID, _BID,
            )
        assert state.circuit.is_open is opens


class TestStreamModelKwargs:
    def test_default_keeps_the_existing_call_shape(self):
        with patch('app.config.get_settings', return_value=SimpleNamespace(llm_stream_disable_thinking=False)):
            assert stream_provider._stream_llm_kwargs('glm') == {
                'provider': 'glm', 'max_tokens': stream_provider._STREAM_MAX_OUTPUT_TOKENS,
                'max_retries': 0,  # the chain hops; the SDK must not retry silently
            }

    def test_shipped_default_disables_hidden_reasoning_on_the_answer_stream(self):
        """30s of dead air before the first token was measured with thinking on."""
        from app.config import Settings
        assert Settings.model_fields['llm_stream_disable_thinking'].default is True
        assert stream_provider._stream_llm_kwargs('glm')['disable_thinking'] is True

    def test_opt_in_adds_the_thinking_flag_and_a_hop_model(self):
        with patch('app.config.get_settings', return_value=SimpleNamespace(llm_stream_disable_thinking=True)):
            assert stream_provider._stream_llm_kwargs('glm', model='small') == {
                'provider': 'glm', 'max_tokens': stream_provider._STREAM_MAX_OUTPUT_TOKENS,
                'model': 'small', 'disable_thinking': True, 'max_retries': 0,
            }


class TestCandidateOrder:
    def test_same_provider_first_then_other_providers(self):
        glm = _state('glm', 'big', fallback='small')
        other = _state('deepseek', 'deepseek-chat')
        with patch.object(stream_fallback, 'get_registry', return_value=_registry_lookup(glm)), \
             patch.object(stream_fallback, 'resolve_fallback_provider', return_value=other):
            chain = stream_fallback.fallback_candidates('glm', 'big')
        assert [(s.config.name, m) for s, _, m in chain] == [('glm', 'small'), ('deepseek', 'deepseek-chat')]

    def test_the_next_provider_contributes_both_of_its_models(self):
        mimo = _state('mimo', 'mimo-v2.5')
        glm = _state('glm', 'big', fallback='small')
        with patch.object(stream_fallback, 'get_registry', return_value=_registry_lookup(mimo)), \
             patch.object(stream_fallback, 'resolve_fallback_provider', return_value=glm):
            chain = stream_fallback.fallback_candidates('mimo', 'mimo-v2.5')
        assert [(s.config.name, m) for s, _, m in chain] == [('glm', 'big'), ('glm', 'small')]

    @pytest.mark.asyncio
    async def test_a_retired_primary_then_a_limited_default_still_reaches_the_sibling(self):
        """Seen live: the router picked the retired model, the next provider's
        default returned 429, and the chain ended in an error although
        glm-4-flash on the same provider was fine."""
        mimo = _state('mimo', 'mimo-v2.5')
        glm = _state('glm', 'big', fallback='small')
        with patch.object(stream_provider, 'get_llm', return_value=_Dead()), \
             patch.object(stream_provider, '_handle_stream_failure', new=AsyncMock()), \
             patch('app.services.companion.stream_fallback.get_llm',
                   side_effect=[_RateLimited(), _Text('from small')]) as fb_llm, \
             patch('app.services.companion.stream_fallback.get_registry',
                   return_value=_registry_lookup(mimo, glm)), \
             patch('app.services.companion.stream_fallback.resolve_fallback_provider', return_value=glm), \
             patch('app.services.companion.stream_fallback.quick_safety_check', return_value=True):
            collected, chunks = [], []
            async for chunk in stream_provider._stream_from_provider(
                state=mimo, provider_name='mimo', model_used='mimo-v2.5', messages=[],
                collected_parts=collected, request_id='req-9', start_time=0.0,
                user_id=_UID, book_id=_BID, lang='en', cancelled=asyncio.Event(),
            ):
                chunks.append(chunk)
        assert [c.kwargs['model'] for c in fb_llm.call_args_list] == ['big', 'small']
        assert collected == ['from small']
        assert _frames(chunks, 'model') == ['big', 'small']
        assert _ERROR_TEXT not in ''.join(chunks)


class _RateLimited:
    async def astream(self, messages):
        raise _VendorError(429, 'rate limit')
        yield  # pragma: no cover


class _VendorError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


class TestModelRateLimitCooldown:
    """A 429 parks one MODEL; the provider's sibling keeps answering."""

    @pytest.mark.asyncio
    async def test_a_429_on_the_primary_is_remembered_for_that_model(self):
        glm = _state('glm', 'big', fallback='small')
        with patch.object(stream_provider, '_handle_stream_failure', wraps=stream_provider._handle_stream_failure), \
             patch('app.services.companion.safety.persist_stream_log'), \
             patch('app.services.llm.registry.get_registry', return_value=MagicMock()):
            await stream_provider._handle_stream_failure(
                _VendorError(429, 'rate limit'), glm, 'glm', 'big', 'req-1', 0.0, _UID, _BID,
            )
        assert stream_cooldown.model_cooling('glm', 'big') is True
        assert stream_cooldown.model_cooling('glm', 'small') is False, 'the sibling is not guilty'

    @pytest.mark.asyncio
    async def test_later_turns_skip_the_limited_model_and_do_not_pay_for_it_again(self):
        glm = _state('glm', 'big', fallback='small')
        stream_cooldown.note_rate_limited('glm', 'big')
        with patch.object(stream_provider, 'get_llm', return_value=_Dead()) as primary_llm, \
             patch.object(stream_provider, '_handle_stream_failure', new=AsyncMock()), \
             patch('app.services.companion.stream_fallback.get_llm', return_value=_Text('from small')), \
             patch('app.services.companion.stream_fallback.get_registry',
                   return_value=_registry_lookup(glm)), \
             patch('app.services.companion.stream_fallback.resolve_fallback_provider', return_value=None), \
             patch('app.services.companion.stream_fallback.quick_safety_check', return_value=True):
            chunks = [c async for c in stream_provider._stream_from_provider(
                state=glm, provider_name='glm', model_used='big', messages=[],
                collected_parts=[], request_id='req-2', start_time=0.0,
                user_id=_UID, book_id=_BID, lang='en', cancelled=asyncio.Event(),
            )]
        assert primary_llm.call_count == 0, 'the limited model is not even attempted'
        assert _frames(chunks, 'model') == ['small']
        assert _frames(chunks, 'content') == ['from small']

    @pytest.mark.asyncio
    async def test_a_single_model_deployment_still_tries_its_only_model(self):
        only = _state('glm', 'big')
        stream_cooldown.note_rate_limited('glm', 'big')
        with patch.object(stream_provider, 'get_llm', return_value=_Text('answered after all')) as primary_llm, \
             patch('app.services.companion.stream_fallback.get_registry', return_value=_registry_lookup(only)), \
             patch('app.services.companion.stream_fallback.resolve_fallback_provider', return_value=None):
            chunks = [c async for c in stream_provider._stream_from_provider(
                state=only, provider_name='glm', model_used='big', messages=[],
                collected_parts=[], request_id='req-3', start_time=0.0,
                user_id=_UID, book_id=_BID, lang='en', cancelled=asyncio.Event(),
            )]
        assert primary_llm.call_count == 1
        assert _frames(chunks, 'content') == ['answered after all']

    @pytest.mark.asyncio
    async def test_a_limited_fallback_hop_is_passed_over_for_a_fresh_one(self):
        glm = _state('glm', 'big', fallback='small')
        other = _state('deepseek', 'deepseek-chat')
        stream_cooldown.note_rate_limited('glm', 'small')
        chunks, _, fb_llm = await _stream(
            glm, fallback_llms=[_Text('from deepseek')], resolve=other, lookup=[other],
        )
        assert fb_llm.call_args.kwargs['model'] == 'deepseek-chat'
        assert _frames(chunks, 'model') == ['deepseek-chat']

    @pytest.mark.asyncio
    async def test_a_429_on_a_hop_parks_that_hop(self):
        glm = _state('glm', 'big', fallback='small')
        other = _state('deepseek', 'deepseek-chat')
        await _stream(glm, fallback_llms=[_RateLimited(), _Text('from deepseek')],
                      resolve=other, lookup=[other])
        assert stream_cooldown.model_cooling('glm', 'small') is True
        assert stream_cooldown.model_cooling('glm', 'big') is False

    def test_the_cooldown_expires(self):
        stream_cooldown.note_rate_limited('glm', 'big', cooldown_s=0.01)
        assert stream_cooldown.model_cooling('glm', 'big') is True
        time.sleep(0.02)
        assert stream_cooldown.model_cooling('glm', 'big') is False
