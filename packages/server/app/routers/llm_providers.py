"""LLM provider ops routes — inspect and hot-reload the provider registry.

Hot-plug contract (P1): providers come from the LLM_PROVIDERS env var (JSON
array) or the legacy GLM_* single-provider config. This router lets an
authenticated user:
- GET  /providers  — list configured providers with circuit/RPM/latency state
- POST /providers/reload — re-read env (reload_settings) and rebuild the
    registry if the fingerprint changed; keeps circuit state per provider
- PUT  /providers  — accept a full provider list in the request body,
    apply it to the live registry immediately (in-memory; compose restart
    reverts to env — documented behavior)

Config changes are validated first; an invalid body never empties the
registry (the previous provider set keeps serving).
"""

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ValidationError

from app.config import ProviderConfig, get_settings, reload_settings
from app.middleware.auth import get_current_user  # noqa: F401 — kept for reference
from app.middleware.ops_auth import require_ops_key
from app.middleware.rate_limiter import account_limiter
from app.schemas.common import GenericResponse
from app.services.llm.registry import get_registry

router = APIRouter(
    prefix='/api/v1/llm-providers',
    tags=['llm-providers'],
    # 2026-09-30 risk-review tightening: previously ops_key_or_current_user
    # let ANY logged-in user Bearer write provider configs (design debt from
    # 6f923a4c). Provider management is a platform-level operation — ops
    # key only, same as the rest of the ops surface.
    dependencies=[account_limiter, Depends(require_ops_key)],
)


def _state_snapshot() -> list[dict[str, Any]]:
    """Serialize registry state for API responses (no secrets)."""
    registry = get_registry()
    settings = get_settings()
    out: list[dict[str, Any]] = []
    for state in registry.all_providers():
        cfg = state.config
        out.append({
            'name': cfg.name,
            'baseUrl': cfg.base_url,
            'models': cfg.models,
            'priority': cfg.priority,
            'costWeight': cfg.cost_weight,
            'maxRpm': cfg.max_rpm,
            'maxTpm': cfg.max_tpm,
            'circuitState': str(state.circuit.state.value),
            'avgLatencyMs': round(state.avg_latency_ms, 1),
            'rpmWindowUsed': state.call_count,
            # P-A: the registry has tracked TPM consumption all along "for
            # dashboards" — surface it so throttling pressure is visible
            # before 429s start (max_tpm<=0 means untracked/unlimited).
            'tpmWindowUsed': state.token_count,
            'isDefault': cfg.name == 'glm' and not settings.llm_providers.strip(),
        })
    return out


class ProviderListBody(BaseModel):
    """Full replacement list of provider configs (PUT)."""

    providers: list[ProviderConfig]


@router.get('', response_model=GenericResponse)
async def list_providers(
    # auth: router-level require_ops_key
) -> GenericResponse:
    """List configured LLM providers with live circuit/RPM state."""
    registry = get_registry()
    registry.reload_if_changed_sync()
    from app.services.llm.circuit_breaker import recent_transitions

    return GenericResponse(success=True, data={
        'providers': _state_snapshot(),
        'circuitTransitions': recent_transitions(),
    })


@router.post('/reload', response_model=GenericResponse)
async def reload_providers(
    # auth: router-level require_ops_key
) -> GenericResponse:
    """Re-read settings from env and hot-reload the registry if changed."""
    reload_settings()
    registry = get_registry()
    changed = await registry.reload_if_changed()
    return GenericResponse(success=True, data={
        'changed': changed,
        'providers': _state_snapshot(),
    })


@router.put('', response_model=GenericResponse)
async def put_providers(
    body: ProviderListBody,
    # auth: router-level require_ops_key
) -> GenericResponse:
    """Replace the live provider set (in-memory hot swap).

    Snapshot-restore: the previous LLM_PROVIDERS env value is captured
    before mutation; any failure (Pydantic validation, empty list, rebuild
    error) restores it and re-reads settings so the registry keeps serving
    the previous set. In-memory only: a process restart reverts to the
    deployment env — persist desired changes in LLM_PROVIDERS for durability.
    """
    import json
    import os

    registry = get_registry()
    if not body.providers:
        raise ValueError('At least one provider is required')

    # J3: the state snapshot never returns api keys, so the console sends
    # an empty api_key for unchanged providers — merge the live key back
    # server-side. A provider that has no existing key (new entry) is
    # rejected: the registry must never go live with an empty credential.
    merged: list[ProviderConfig] = []
    existing = {cfg.name: cfg for cfg in get_settings().provider_configs}
    for p in body.providers:
        if not p.api_key:
            live = existing.get(p.name)
            if not live or not live.api_key:
                raise ValueError(f'Provider {p.name!r} has no stored key — supply api_key explicitly')
            merged.append(p.model_copy(update={'api_key': live.api_key}))
        else:
            merged.append(p)

    prev_env = os.environ.get('LLM_PROVIDERS')
    try:
        os.environ['LLM_PROVIDERS'] = json.dumps([p.model_dump() for p in merged])
        reload_settings()
        changed = await registry.reload_if_changed()
        return GenericResponse(success=True, data={
            'changed': changed,
            'persisted': False,
            'providers': _state_snapshot(),
        })
    except (ValidationError, ValueError) as exc:
        # Roll back the env mutation and the cached settings.
        if prev_env is None:
            os.environ.pop('LLM_PROVIDERS', None)
        else:
            os.environ['LLM_PROVIDERS'] = prev_env
        reload_settings()
        raise ValueError(f'Invalid provider config: {exc}') from exc
