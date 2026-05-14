"""LLM log API — query and inspect LLM call history."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.common import GenericResponse
from app.schemas.llm_log import (
    LLMLogListResponse,
    LLMLogResponse,
    LLMUsageSummaryResponse,
)
from app.services import llm_log_service

router = APIRouter(prefix='/api/v1/logs', tags=['logs'])


@router.get('/llm', response_model=LLMLogListResponse)
async def list_llm_logs(
    model: str | None = Query(None),
    label: str | None = Query(None),
    success: bool | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LLMLogListResponse:
    """Return paginated LLM call logs with optional filters."""
    logs, total = await llm_log_service.get_llm_logs(
        db,
        UUID(current_user['id']),
        model=model,
        label=label,
        success=success,
        date_from=date_from,
        date_to=date_to,
        page=page,
        per_page=per_page,
    )
    return LLMLogListResponse(
        data=[LLMLogResponse.model_validate(log) for log in logs],
        total=total,
    )


@router.get('/llm/summary', response_model=LLMUsageSummaryResponse)
async def get_llm_usage_summary(
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LLMUsageSummaryResponse:
    """Return aggregated LLM usage stats for the current user."""
    summary = await llm_log_service.get_usage_summary(
        db, UUID(current_user['id']), days=days,
    )
    return LLMUsageSummaryResponse(**summary)


@router.get('/llm/{log_id}', response_model=GenericResponse)
async def get_llm_log_detail(
    log_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a single LLM log entry."""
    log = await llm_log_service.get_llm_log_by_id(
        db, UUID(current_user['id']), log_id,
    )
    if log is None:
        return {'success': True, 'data': None}
    return {
        'success': True,
        'data': LLMLogResponse.model_validate(log).model_dump(mode='json'),
    }
