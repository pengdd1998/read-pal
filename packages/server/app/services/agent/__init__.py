"""Agent service package — stream registry, SSE plumbing, Phase 2 agents."""

from app.services.agent.coach import run_coach_report  # noqa: F401 — re-exported
from app.services.agent.research import run_research  # noqa: F401 — re-exported
from app.services.agent.synthesis_modes import (  # noqa: F401 — re-exported
    resolve_synthesis_mode,
    run_synthesis_mode,
)
