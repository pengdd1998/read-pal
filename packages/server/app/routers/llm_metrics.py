"""LLM metrics route — the five minimal observability indicators.

Read-only aggregation over ``llm_call_traces`` (engineering-upgrade B4).
Router stays thin per AGENTS.md Never-rule 2: validation here, computation
in ``app.services.llm.metrics`` / ``app.services.llm.trace_queries``.

Monitoring-upgrade P-A (2026-09-20): row-level trace browsing —
``GET /requests`` (filterable list) and ``GET /requests/{request_id}``
(one SSE turn's full call chain). Both are ops-ONLY (cross-user
metadata) and guarded by the shared ``require_ops_key`` dependency.
"""

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.ops_auth import ops_key_valid, require_ops_key
from app.middleware.rate_limiter import account_limiter
from app.schemas.common import GenericResponse
from app.services.llm.metrics import MAX_METRICS_WINDOW_HOURS, compute_llm_metrics
from app.services.llm.trace_queries import (
    MAX_TRACE_WINDOW_HOURS,
    get_trace_chain,
    list_llm_traces,
)

router = APIRouter(
    prefix='/api/v1/stats/llm',
    tags=['llm-metrics'],
    dependencies=[account_limiter],
)


@router.get('', response_model=GenericResponse)
async def get_llm_metrics(
    hours: int = Query(24, ge=1, le=MAX_METRICS_WINDOW_HOURS),
    guardrail_days: int = Query(1, ge=1, le=30),
    label: str | None = Query(None, max_length=100),
    provider: str | None = Query(None, max_length=32),
    model: str | None = Query(None, max_length=50),
    x_ops_key: str | None = Header(None, alias='X-Ops-Key'),  # P7.2 — never in the URL (access logs)
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
    ops_ok = ops_key_valid(x_ops_key)
    data = await compute_llm_metrics(
        hours=hours,
        session=db,
        user_id=None if ops_ok else str(_current_user['id']),
        force_global=ops_ok,
        guardrail_days=guardrail_days,
        filter_label=label,
        filter_provider=provider,
        filter_model=model,
    )
    return GenericResponse(success=True, data=data)


@router.get('/requests', response_model=GenericResponse, dependencies=[Depends(require_ops_key)])
async def list_llm_trace_rows(
    hours: int = Query(24, ge=1, le=MAX_TRACE_WINDOW_HOURS),
    label: str | None = Query(None, max_length=100),
    success: bool | None = Query(None),
    error_type: str | None = Query(None, max_length=32),
    request_prefix: str | None = Query(None, max_length=50, description='http_request_id prefix search'),
    q: str | None = Query(None, max_length=200, description='E1: search in captured prompt/output text'),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> GenericResponse:
    """Row-level trace list (ops-only): newest-first, filterable, paginated.
    ``user`` fields are salted-free 8-hex digests — correlation without
    exposing ids. ``q`` searches llm_trace_contents text (E1)."""
    data = await list_llm_traces(
        db,
        hours=hours,
        label=label,
        success=success,
        error_type=error_type,
        request_prefix=request_prefix,
        q=q,
        limit=limit,
        offset=offset,
    )
    return GenericResponse(success=True, data=data)


@router.get('/requests/{request_id}', response_model=GenericResponse, dependencies=[Depends(require_ops_key)])
async def get_llm_trace_chain(
    request_id: str,
    db: AsyncSession = Depends(get_db),
) -> GenericResponse:
    """One SSE turn's full call chain (ops-only): every trace sharing the
    ``http_request_id`` — main answer + tool loop + fallback retries —
    oldest-first with a chain-level latency summary."""
    data = await get_trace_chain(db, request_id)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail={'code': 'TRACE_NOT_FOUND', 'message': 'No traces for this request id.'},
        )
    return GenericResponse(success=True, data=data)


@router.get('/requests/{request_id}/content', response_model=GenericResponse, dependencies=[Depends(require_ops_key)])
async def get_llm_trace_content(
    request_id: str,
    model: str | None = Query(None, max_length=50),
    db: AsyncSession = Depends(get_db),
) -> GenericResponse:
    """P-D: captured raw prompt/output for one call (ops-only).

    404 body carries ``reason``: ``capture_disabled`` when the deployment
    never opted in (``LLM_TRACE_CONTENT_DB=false``), ``not_found`` when
    the row is absent (cache-served call, failed call, pre-feature row,
    or past the retention horizon)."""
    from app.config import get_settings
    from app.services.llm.trace_queries import get_trace_content

    if not get_settings().llm_trace_content_db:
        raise HTTPException(
            status_code=404,
            detail={
                'code': 'TRACE_CONTENT_UNAVAILABLE',
                'reason': 'capture_disabled',
                'message': 'Content capture is off (LLM_TRACE_CONTENT_DB).',
            },
        )
    data = await get_trace_content(db, request_id, model=model)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail={
                'code': 'TRACE_CONTENT_UNAVAILABLE',
                'reason': 'not_found',
                'message': 'No captured content for this request id.',
            },
        )
    return GenericResponse(success=True, data=data)
