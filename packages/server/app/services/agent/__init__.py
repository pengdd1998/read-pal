"""Agent service package — stream registry, SSE plumbing, Phase 2 agents."""

from app.services.agent.coach import run_coach_report  # noqa: F401 — re-exported
from app.services.agent.research import run_research  # noqa: F401 — re-exported
from app.services.agent.synthesis_modes import (  # noqa: F401 — re-exported
    resolve_synthesis_mode,
    run_synthesis_mode,
)

from app.services.agent.gateway import (  # noqa: F401,E402
    _KEEPALIVE_FRAME,
    _PRODUCER_STALL_WARN_SECONDS,
    _SENTINEL,
    _consume_queue,
    new_request_id,
    raise_not_found,
    resolve_lang,
    sse_bytes_stream,
)
from app.services.agent.stream_registry import (  # noqa: F401,E402 — public registry API
    cancel_stream,
    cancel_stream_cross_worker,
    register_stream,
    register_stream_cross_worker,
    release_stream,
    release_stream_cross_worker,
)
