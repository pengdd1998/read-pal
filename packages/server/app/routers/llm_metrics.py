"""LLM metrics route — the five minimal observability indicators.

Read-only aggregation over ``llm_call_traces`` (engineering-upgrade B4).
Router stays thin per AGENTS.md Never-rule 2: validation here, computation
in ``app.services.llm.metrics``.
"""

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import account_limiter
from app.schemas.common import GenericResponse
from app.services.llm.metrics import MAX_METRICS_WINDOW_HOURS, compute_llm_metrics

router = APIRouter(
    prefix='/api/v1/stats/llm',
    tags=['llm-metrics'],
    dependencies=[account_limiter],
)


def _ops_key_valid(provided: str | None) -> bool:
    """Constant-time compare against the configured ops key.

    Checks os.environ first (container env / test monkeypatch), then the
    settings object (.env-file config, e.g. local dev) — pydantic loads
    .env into Settings but never exports it to the process environ.
    """
    import hmac
    import os

    from app.config import get_settings

    expected = (os.environ.get('OPS_KEY') or get_settings().ops_key or '').strip()
    return bool(expected and provided and hmac.compare_digest(expected, provided))


@router.get('', response_model=GenericResponse)
async def get_llm_metrics(
    hours: int = Query(24, ge=1, le=MAX_METRICS_WINDOW_HOURS),
    x_ops_key: str | None = Header(None, alias='X-Ops-Key'),
    _current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GenericResponse:
    """Success rate, p50/p95/p99 latency, token cost, error breakdown,
    guardrail hits, and a per-label drilldown over the last ``hours``.

    User-scoped by default (24h-review R2). A valid ops key (X-Ops-Key
    header) unlocks the platform-wide view for the /ops/llm page. The key
    must not travel in the URL: nginx access logs record the full request
    line, so a query param would persist the secret on disk.
    """
    ops_ok = _ops_key_valid(x_ops_key)
    data = await compute_llm_metrics(
        hours=hours, session=db,
        user_id=None if ops_ok else str(_current_user['id']),
        force_global=ops_ok,
    )
    return GenericResponse(success=True, data=data)
