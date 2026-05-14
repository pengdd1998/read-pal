"""LLM log response schemas."""

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class LLMLogResponse(BaseModel):
    id: UUID
    user_id: UUID | None = None
    book_id: UUID | None = None
    request_id: str
    model: str
    label: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost: Decimal | None = None
    latency_ms: int = 0
    success: bool = True
    error_message: str | None = None
    is_fallback: bool = False
    extra: dict[str, Any] | None = None
    created_at: datetime | None = None

    model_config = {'from_attributes': True}


class LLMLogListResponse(BaseModel):
    data: list[LLMLogResponse]
    total: int


class LLMUsageByModel(BaseModel):
    model: str
    calls: int
    promptTokens: int
    completionTokens: int
    totalTokens: int
    totalCost: float
    avgLatencyMs: float


class LLMUsageByLabel(BaseModel):
    label: str
    calls: int
    totalTokens: int


class LLMUsageSummaryResponse(BaseModel):
    period: str
    byModel: list[LLMUsageByModel]
    byLabel: list[LLMUsageByLabel]
