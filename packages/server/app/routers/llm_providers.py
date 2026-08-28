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
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import account_limiter
from app.schemas.common import GenericResponse
from app.services.llm.registry import get_registry

router = APIRouter(
    prefix='/api/v1/llm-providers',
    tags=['llm-providers'],
    dependencies=[account_limiter],
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
            'isDefault': cfg.name == 'glm' and not settings.llm_providers.strip(),
        })
    return out


class ProviderListBody(BaseModel):
    """Full replacement list of provider configs (PUT)."""

    providers: list[ProviderConfig]


@router.get('', response_model=GenericResponse)
async def list_providers(
    _current_user: dict = Depends(get_current_user),
) -> GenericResponse:
    """List configured LLM providers with live circuit/RPM state."""
    registry = get_registry()
    registry.reload_if_changed_sync()
    return GenericResponse(success=True, data={'providers': _state_snapshot()})


@router.post('/reload', response_model=GenericResponse)
async def reload_providers(
    _current_user: dict = Depends(get_current_user),
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
    _current_user: dict = Depends(get_current_user),
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
    prev_env = os.environ.get('LLM_PROVIDERS')
    try:
        os.environ['LLM_PROVIDERS'] = json.dumps([p.model_dump() for p in body.providers])
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
