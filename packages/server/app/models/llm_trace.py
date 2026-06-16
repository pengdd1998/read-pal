"""LLM call trace model — persistent observability for every LLM invocation."""

import uuid
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LLMCallTrace(Base):
    __tablename__ = 'llm_call_traces'
    __table_args__ = (
        Index('ix_llm_traces_created', 'created_at'),
        Index('ix_llm_traces_model_created', 'model', 'created_at'),
        Index('ix_llm_traces_label_created', 'label', 'created_at'),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text('gen_random_uuid()'),
    )
    request_id: Mapped[str] = mapped_column(String(12), nullable=False)
    model: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # Added in migration 0019 — finish reason ('stop', 'length', 'content_filter', etc.)
    finish_reason: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Added in migration 0019 — language code ('en', 'zh') for per-lang quality metrics
    lang: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Added in migration 0019 — prompt template version (e.g. 'v3') or MD5 hash
    prompt_version: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # P2.1: time-to-first-token in ms. NULL when no tokens emitted (error path,
    # empty response, or non-streaming call where TTFT == latency).
    ttft_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # P4.2: cache_hit = TRUE when the call was served from the Redis JSON cache
    # without contacting the vendor. Lets dashboards compute hit rate and
    # exclude cache-served requests from cost/latency percentiles.
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text('false'))
    # P4.2: categorical error type ('rate_limit', 'network', 'timeout',
    # 'auth', 'server_error', 'cancelled', 'unknown'). NULL on success.
    # Lets dashboards group failures without regex on error_message.
    error_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text('now()'),
    )
