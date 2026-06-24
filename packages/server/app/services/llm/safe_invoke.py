"""Safe LLM invoke — circuit breaker, multi-provider fallback, caching, JSON parsing.

Public API: ``safe_llm_call`` and ``safe_llm_invoke``.
Internal helpers are re-exported from sub-modules for backward compatibility.
"""

from __future__ import annotations

import hashlib
import uuid
from typing import Any

import structlog
from langchain_core.messages import BaseMessage

from app.services.llm.circuit_fallback import (
    _handle_invoke_failure,
    _invoke_with_circuit,
    _select_provider,
)
from app.services.llm.observability import _log_cache_hit
from app.services.llm.provider_fallback import (
    _invoke_and_record_fallback,
    _record_failure,
    _record_success,
    _try_next_provider,
    _try_same_provider_fallback,
)
from app.services.llm.retry import _invoke_with_retry
from app.services.llm.text import _repair_json, _strip_markdown_fences, _validate_parsed

logger = structlog.get_logger('read-pal.llm')


def _emit_cache_hit_trace(
    *,
    label: str,
    prompt_version: str | None,
    user_id: str | None,
    book_id: str | None,
    lang: str | None,
) -> None:
    """Emit a trace row for a cache-served response.

    P4.2: extracted from the duplicated inline blocks in
    ``safe_llm_invoke`` and ``safe_llm_call``. Both APIs had identical
    cache-hit logging code — DRY violation that risked drift if one path
    added a field and the other didn't.
    """
    _log_cache_hit(
        request_id=uuid.uuid4().hex[:12],
        label=label,
        prompt_version=prompt_version,
        user_id=user_id,
        book_id=book_id,
        lang=lang,
    )

# ---------------------------------------------------------------------------
# Cache sentinel
# ---------------------------------------------------------------------------


class _MissingSentinel:
    pass


_MISS = _MissingSentinel()


def _should_use_native_structured_output(schema_class: type | None) -> bool:
    """Return True when the pool should pass ``response_format=json_object``.

    C2: gated by ``Settings.llm_native_structured_output`` (default False).
    When the flag is on AND a schema_class is provided (i.e. the caller
    expects JSON output), the pool constructs ChatOpenAI with the
    ``json_object`` response format. Off-by-default lets ops opt in after
    verifying provider support.

    Plain-text ``safe_llm_call`` never passes schema_class, so it stays on
    the prompt-only path even when the flag is on.
    """
    if schema_class is None:
        return False
    try:
        from app.config import get_settings
        return bool(get_settings().llm_native_structured_output)
    except Exception:  # noqa: BLE001 — best-effort flag read
        return False


async def _check_json_cache(
    key: str,
    schema_class: type | None,
    log_label: str,
) -> Any:
    """Return parsed JSON from cache if available, or sentinel _MISS.

    P1.5: uses the repair ladder so a cached entry that happens to contain
    prose-wrapped JSON (e.g. written before P1.5) still parses cleanly
    instead of being treated as a miss and triggering a fresh LLM call.

    P4.4: ``_repair_json`` is now imported at module level — the local
    re-import was leftover debt from when this function predated the
    top-level import.
    """
    from app.services.llm.cache import _cache_get

    if not key:
        return _MISS
    cached = await _cache_get(key)
    if cached is None:
        return _MISS
    parsed, _stage = _repair_json(cached, log_label=log_label)
    if parsed is None:
        logger.debug('safe_invoke.cache_corrupt_json', key=key[:16] if key else None)
        return _MISS
    if schema_class is not None:
        # Treat a cached-but-schema-invalid entry as a miss so the next call
        # re-fetches fresh output instead of serving a structurally-wrong value.
        try:
            parsed = schema_class.model_validate(parsed).model_dump()
        except (ValueError, TypeError) as exc:
            logger.warning(
                'safe_invoke.cache_schema_invalid',
                label=log_label, error=str(exc)[:200],
            )
            return _MISS
    return parsed


# ---------------------------------------------------------------------------
# Template resolution helper
# ---------------------------------------------------------------------------


def _resolve_template_params(
    template: Any,
    temperature: float | None,
    max_tokens: int | None,
) -> tuple[str | None, float | None, int | None]:
    """Resolve prompt_version + template-derived temperature/max_tokens.

    P4.4: extracted from the duplicated setup blocks in ``safe_llm_invoke``
    and ``safe_llm_call``. The prompt_version feeds BOTH the cache key
    (so a template bump evicts stale entries — P0.4) AND the trace log.
    Both values were computed independently in each path — DRY violation
    that risked drift if one path added a new version source without the
    other, which would silently cache stale entries on the divergent path.

    Returns ``(prompt_version, temperature, max_tokens)``. The latter two
    are only filled from the template when the explicit kwargs are None —
    explicit kwargs win, matching the resolution order documented in
    ``safe_llm_invoke``.
    """
    if template is None:
        return None, temperature, max_tokens
    declared_version = getattr(template, 'version', None)
    if declared_version is not None:
        prompt_version = f'v{declared_version}'
    else:
        prompt_version = hashlib.md5(
            getattr(template, 'template', '').encode(),
        ).hexdigest()[:8]
    if temperature is None:
        temperature = getattr(template, 'temperature', None)
    if max_tokens is None:
        max_tokens = getattr(template, 'max_tokens', None)
    return prompt_version, temperature, max_tokens


# ---------------------------------------------------------------------------
# Public safe-call API
# ---------------------------------------------------------------------------


async def safe_llm_invoke(
    messages: list[BaseMessage],
    *,
    fallback: Any = None,
    log_label: str = 'LLM',
    schema_class: type | None = None,
    use_cache: bool = True,
    user_id: str | None = None,
    book_id: str | None = None,
    feature: str | None = None,
    lang: str | None = None,
    template: Any = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> Any:
    """Invoke LLM with circuit breaker, multi-provider fallback, caching, JSON parsing.

    ``template`` / ``temperature`` / ``max_tokens`` resolution order: explicit
    kwargs win, then the ``template``'s fields, then pool defaults. Passing
    both is encouraged — explicit kwargs make the call site self-documenting
    and avoid the silent "I set max_tokens on the template but forgot to pass
    template=" trap.
    """
    from app.services.llm.cache import _cache_key, _cache_set

    effective_feature = feature or log_label

    # P4.4: prompt_version + template-derived temperature/max_tokens are
    # resolved via the shared helper so this path can't drift from
    # safe_llm_call on a new field source.
    prompt_version, temperature, max_tokens = _resolve_template_params(
        template, temperature, max_tokens,
    )

    # Cache key includes prompt_version so a template bump evicts stale entries.
    key = (
        _cache_key(
            messages, log_label, user_id=user_id, lang=lang,
            prompt_version=prompt_version,
        )
        if use_cache else ''
    )

    cached = await _check_json_cache(key, schema_class, log_label)
    if not isinstance(cached, _MissingSentinel):
        # P4.2: emit a cache-hit trace so cache-served responses show up in
        # the same observability surface as fresh LLM calls. Previously the
        # cache path short-circuited silently, making hit rate uncomputable
        # and hiding why a request was "free".
        _emit_cache_hit_trace(
            label=log_label, prompt_version=prompt_version,
            user_id=user_id, book_id=book_id, lang=lang,
        )
        return cached

    response = await _invoke_with_circuit(
        messages, log_label=log_label,
        user_id=user_id, book_id=book_id,
        feature=effective_feature,
        temperature=temperature, max_tokens=max_tokens,
        prompt_version=prompt_version, lang=lang,
        structured_output=_should_use_native_structured_output(schema_class),
    )
    if response is None:
        return fallback

    content = _strip_markdown_fences(response.content.strip())
    if key:
        await _cache_set(key, content)

    # P1.5: multi-stage JSON repair ladder. Bare json.loads was a top source
    # of silent failures in production — LLMs routinely wrap output in prose,
    # leave trailing commas, or emit "Sure, here's..." preambles. Each
    # successful stage is logged so we can see which repair class dominates.
    parsed, stage = _repair_json(content, log_label=log_label)
    if parsed is None:
        return fallback
    if stage != 'strict':
        logger.info(
            'llm_json_repaired',
            label=log_label, stage=stage,
        )

    if schema_class is not None:
        parsed = _validate_parsed(parsed, schema_class, log_label, fallback)
    return parsed


async def safe_llm_call(
    messages: list[BaseMessage],
    *,
    fallback: str = '',
    log_label: str = 'LLM',
    use_cache: bool = True,
    user_id: str | None = None,
    book_id: str | None = None,
    feature: str | None = None,
    lang: str | None = None,
    template: Any = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    cache_anon: bool = False,
) -> str:
    """Invoke LLM with circuit breaker + multi-provider fallback, returning raw text.

    Mirrors :func:`safe_llm_invoke`'s ``template`` / ``temperature`` /
    ``max_tokens`` resolution: explicit kwargs win, then template fields,
    then pool defaults.

    Phase 5.1 (m6): ``cache_anon=True`` opts the call into a user-independent
    cache tier — the cache key uses ``user_id='anon'`` so all users with the
    same prompt share a cached response. ONLY safe for calls whose output
    does NOT depend on user identity or per-user state (genre lookup, mood
    classification with deterministic quiz input, generic metadata
    enrichment). Never use for companion chat, flashcard generation, or
    anything containing user-specific context. Default is False (per-user
    isolation preserved).
    """
    from app.services.llm.cache import _cache_get, _cache_key, _cache_set

    effective_feature = feature or log_label

    # P4.4: shared with safe_llm_invoke via _resolve_template_params so a
    # new field source on one path doesn't silently diverge the cache key.
    prompt_version, temperature, max_tokens = _resolve_template_params(
        template, temperature, max_tokens,
    )

    # LA-2 (post-rollout review): when cache_anon is opted in, emit an
    # audit log so privacy reviews can grep for callers using cross-user
    # cache sharing. If a future PR incorrectly enables this on a
    # personalized call, this line makes the leak visible.
    if cache_anon and use_cache:
        logger.info(
            'llm.cache_anon_opted_in',
            label=log_label,
            prompt_version=prompt_version,
            actual_user_id=user_id,
            book_id=book_id,
        )

    # Cache key includes prompt_version so a template bump evicts stale entries.
    # Phase 5.1: cache_anon overrides the user slot to 'anon' for the cache
    # key only — observability still records the actual user_id.
    cache_user_id = 'anon' if cache_anon else user_id
    key = (
        _cache_key(
            messages, log_label, user_id=cache_user_id, lang=lang,
            prompt_version=prompt_version,
        )
        if use_cache else ''
    )

    # Try cache first
    if key:
        cached = await _cache_get(key)
        if cached is not None:
            # P4.2: same cache-hit trace emission as the JSON path above —
            # keeps the observability surface uniform across both APIs.
            _emit_cache_hit_trace(
                label=log_label, prompt_version=prompt_version,
                user_id=user_id, book_id=book_id, lang=lang,
            )
            from app.utils.output_filter import filter_output
            return filter_output(cached, context=log_label)

    response = await _invoke_with_circuit(
        messages, log_label=log_label,
        user_id=user_id, book_id=book_id,
        feature=effective_feature,
        temperature=temperature, max_tokens=max_tokens,
        prompt_version=prompt_version, lang=lang,
    )
    if response is None:
        return fallback
    content = response.content.strip()

    # Cache the raw content for future use
    if key:
        await _cache_set(key, content)

    # Apply output filter
    from app.utils.output_filter import filter_output
    content = filter_output(content, context=log_label)

    return content
