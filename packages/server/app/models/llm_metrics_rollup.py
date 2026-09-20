"""Hourly LLM metrics rollup (monitoring-upgrade P-C).

One row per (hour, label, provider): the pre-aggregated form of
``llm_call_traces`` that windows beyond the trace retention horizon (and
the alerting thresholds) read instead of scanning the raw table.

p95 fidelity note: each upsert merges its batch's real p95 into the
stored value as a call-weighted average of the two p95s — an
approximation by construction (merging true percentiles needs the
underlying samples). Trend-grade accuracy, not SLA-grade; the row-level
API stays on the trace table for exact numbers.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    Integer,
    PrimaryKeyConstraint,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

ROLLUP_RETENTION_DAYS = 90


class LLMMetricsRollup(Base):
    """Aggregated LLM call metrics per hour × label × provider."""

    __tablename__ = 'llm_metrics_rollup'
    __table_args__ = (
        PrimaryKeyConstraint('hour', 'label', 'provider'),
    )

    # Naive-UTC by design: the hour bucket is always constructed via
    # ``rollup._hour_bucket`` (which strips tz after converting to UTC) so
    # the SELECT-then-merge upsert matches rows identically on SQLite
    # (tests) and Postgres (prod) — tzinfo round-trips differ between the
    # two and broke the merge with UNIQUE violations.
    hour: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default='(unset)')

    calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    successes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fresh_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fallbacks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_in: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    tokens_out: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    latency_cnt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latency_sum_ms: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    latency_max_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latency_p95_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_counts: Mapped[str] = mapped_column(String(512), nullable=False, default='')
    """`err=count,err=count` — failure classification without a child table."""
