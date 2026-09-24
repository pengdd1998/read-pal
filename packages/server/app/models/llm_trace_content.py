"""LLM trace content model — opt-in raw prompt/output capture (P-D).

Companion to ``LLMCallTrace``: the span row stays metadata-only; this table
holds the raw model input/output preview for badcase replay when the
deployment explicitly opts in (``LLM_TRACE_CONTENT_DB``). Default off,
short retention (``llm_trace_content_retention_days``), ops-key-only read
path — see the privacy boundary note in ops/observability/monitoring-upgrade-plan.md.

PK note: ``request_id`` is the same 12-hex per-call id the span exposes
(uuid4().hex[:12]). It is NOT unique in llm_call_traces and 12 hex chars
are not collision-proof at scale, so writers must use ON CONFLICT DO
NOTHING — a PK hit silently drops the duplicate (defensive; see D3).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LLMTraceContent(Base):
    __tablename__ = 'llm_trace_contents'
    __table_args__ = (
        Index('ix_llm_trace_contents_created', 'created_at'),
        Index('ix_llm_trace_contents_http_request_id', 'http_request_id'),
    )

    request_id: Mapped[str] = mapped_column(String(12), primary_key=True)
    http_request_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(50), nullable=False)
    prompt_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    prompt_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_truncated: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    output_truncated: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    # Attribution mirrors the trace row; never returned raw by the read API.
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    book_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text('now()'),
    )
