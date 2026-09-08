"""LLM metrics route — the five minimal observability indicators.

Read-only aggregation over ``llm_call_traces`` (engineering-upgrade B4).
Router stays thin per AGENTS.md Never-rule 2: validation here, computation
in ``app.services.llm.metrics``.
"""

from fastapi import APIRouter, Depends, Query
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


@router.get('', response_model=GenericResponse)
async def get_llm_metrics(
    hours: int = Query(24, ge=1, le=MAX_METRICS_WINDOW_HOURS),
    _current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GenericResponse:
    """Success rate, p50/p95/p99 latency, token cost, error breakdown,
    guardrail hits, and a per-label drilldown over the last ``hours``."""
    data = await compute_llm_metrics(
        hours=hours, session=db, user_id=str(_current_user['id']),
    )
    return GenericResponse(success=True, data=data)
