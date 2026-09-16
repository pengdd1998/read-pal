"""Live eval runner — sends real prompts to the LLM and validates output shapes.

Used for prompt-quality regression testing (mock eval at ``eval_runner.py``
only validates infrastructure). Designed to be opt-in via the ``--live`` CLI
flag; requires ``PROMPT_EVAL_API_KEY`` (aliased to ``GLM_API_KEY`` in CI).

Each handler in ``_LIVE_HANDLERS`` builds the actual prompt for a golden
test case using the same ``PromptTemplate`` the production service uses,
then calls ``safe_llm_call`` / ``safe_llm_invoke`` so the request flows
through the circuit breaker, retry, and observability layers.

Cost discipline: a single live run is capped by ``MAX_LIVE_EVAL_TOKENS``
(default 50K). Pre-estimates tokens per call via ``estimate_tokens`` and
aborts early if the cumulative estimate exceeds the cap.

Services that require DB context (companion chat, friend chat, knowledge
extraction tied to annotations, memory-book sections tied to reading
sessions) are marked ``live_skip=True`` — they cannot be exercised
without a running DB and are out of scope for prompt-quality regression.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field



logger = logging.getLogger('read-pal.eval.live')

DEFAULT_MAX_LIVE_TOKENS = 50_000
PER_CALL_TIMEOUT_SECONDS = 60  # LA-1: was 30, bumped to allow retries under slow-vendor

# LA-4: synthetic user_id for live eval. Lets TPM dashboards filter
# eval traffic from production, and provides a stable attribution bucket
# for cost analytics. Combined with use_cache=False below, ensures live
# eval calls are always fresh AND attributable.
LIVE_EVAL_USER_ID = 'live-eval'

# Services currently out of scope for live eval (need DB / running session).
LIVE_SKIP: set[tuple[str, str]] = {
    ('companion', 'chat'),
    ('companion', 'chat_injection'),
    ('companion', 'summarize'),
    ('companion', 'explain'),
    ('friend', 'chat'),
    ('friend', 'chat_injection'),
    ('knowledge', 'extract_concepts'),
    ('memory_book', 'chapter_1_cover'),
    ('memory_book', 'chapter_2_journey'),
}


@dataclass
class LiveEvalReport:
    """One golden entry's live-eval outcome."""

    name: str
    service: str
    action: str
    passed: bool = True
    errors: list[str] = field(default_factory=list)
    skipped: bool = False
    skip_reason: str = ''
    latency_ms: int = 0
    prompt_version: int | None = None
    model_used: str | None = None
    tokens_estimated: int = 0
    # LA-3: stable error category (matches production _classify_error values)
    # so dashboards can correlate live-eval failures with production incidents.
    error_type: str | None = None
    # Engineering-upgrade B3: truncated output capture so the L2 judge
    # (``--judge`` → app.eval.judges) can score usefulness/factuality —
    # dimensions the L0/L1 shape checks can't see.
    output_text: str = ''

    def fail(self, msg: str) -> None:
        self.passed = False
        self.errors.append(msg)


