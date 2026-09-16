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

import asyncio
import json
import logging
import time
import uuid
from typing import Any


from app.eval.assertions import EvalResult, validate_output_shape
from app.eval.golden_dataset import ALL_GOLDEN
from app.utils.token_budget import estimate_tokens
from app.eval.live._report import LiveEvalReport  # noqa: E402
from app.eval.live._cases import _LIVE_HANDLERS  # noqa: E402

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




# ---------------------------------------------------------------------------
# Pre-estimate tokens for cost-cap enforcement
# ---------------------------------------------------------------------------

def _estimate_call_tokens(golden: dict[str, Any]) -> int:
    """Rough estimate of tokens this golden entry will consume.

    Doubles the JSON-serialized input size to account for system prompt +
    output budget. Used only for the cumulative cost cap; actual usage is
    settled by ``safe_llm_invoke``'s observability layer.
    """
    input_json = json.dumps(golden.get('input', {}), default=str)
    return estimate_tokens(input_json) * 2 + 2000  # +2K for system prompt reserve


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

async def run_live_eval(  # noqa: PLR0915 — single orchestration flow; decomposition tracked as follow-up
    label_filter: str | None = None,
    max_tokens: int = DEFAULT_MAX_LIVE_TOKENS,
) -> list[LiveEvalReport]:
    """Run live eval against all golden entries (or those matching ``label_filter``).

    For each entry:
    1. Skip if (service, action) is in ``LIVE_SKIP``.
    2. Skip if ``label_filter`` is set and doesn't match service/action.
    3. Pre-estimate tokens; abort early if cumulative > ``max_tokens``.
    4. Dispatch to handler; enforce per-call timeout.
    5. Validate output shape against ``expected_output``.
    6. Record latency, prompt_version, model_used, tokens_estimated.
    """
    reports: list[LiveEvalReport] = []
    cumulative_tokens = 0
    request_id = uuid.uuid4().hex[:12]

    for golden in ALL_GOLDEN:
        service = golden['service']
        action = golden['action']
        name = f'{service}/{action}'
        report = LiveEvalReport(name=name, service=service, action=action)

        # Apply label filter (substring match on service or action)
        if label_filter and label_filter.lower() not in name.lower():
            report.skipped = True
            report.skip_reason = f'does not match filter {label_filter!r}'
            reports.append(report)
            continue

        # Skip DB-dependent services
        if (service, action) in LIVE_SKIP:
            report.skipped = True
            report.skip_reason = 'requires DB session (out of live-eval scope)'
            reports.append(report)
            continue

        handler = _LIVE_HANDLERS.get((service, action))
        if handler is None:
            report.skipped = True
            report.skip_reason = 'no live handler registered'
            reports.append(report)
            continue

        # Cost cap
        est = _estimate_call_tokens(golden)
        if cumulative_tokens + est > max_tokens:
            report.skipped = True
            report.skip_reason = (
                f'would exceed token cap ({cumulative_tokens + est} > {max_tokens})'
            )
            reports.append(report)
            logger.warning(
                'live_eval.token_cap_exceeded',
                request_id=request_id,
                name=name,
                cumulative=cumulative_tokens,
                estimated=est,
                cap=max_tokens,
            )
            continue
        cumulative_tokens += est
        report.tokens_estimated = est

        # Dispatch + timeout
        t0 = time.monotonic()
        try:
            async with asyncio.timeout(PER_CALL_TIMEOUT_SECONDS):
                result, prompt_version = await handler(golden['input'])
            report.latency_ms = int((time.monotonic() - t0) * 1000)
            report.prompt_version = prompt_version
            from app.eval.live._output import _resolve_model_name
            report.model_used = _resolve_model_name()
        except TimeoutError:
            report.fail(f'Call exceeded {PER_CALL_TIMEOUT_SECONDS}s timeout')
            report.latency_ms = int((time.monotonic() - t0) * 1000)
            report.error_type = 'timeout'
            reports.append(report)
            continue
        except Exception as exc:  # noqa: BLE001 — eval must surface any failure
            # LA-3 (post-rollout review): classify via the production
            # ``_classify_error`` so live-eval failures correlate with
            # production error categories in dashboards.
            from app.services.llm.observability import _classify_error
            error_type = _classify_error(exc, str(exc)) or 'unknown'
            report.fail(
                f'[{error_type}] Handler raised: '
                f'{type(exc).__name__}: {str(exc)[:200]}'
            )
            report.latency_ms = int((time.monotonic() - t0) * 1000)
            report.error_type = error_type
            reports.append(report)
            continue

        # Validate output shape
        if result is None:
            report.fail('Handler returned None (LLM call failed without raising)')
        else:
            report.output_text = (
                result if isinstance(result, str)
                else json.dumps(result, ensure_ascii=False, default=str)
            )[:2000]
            eval_result = EvalResult(name, service, action)
            validate_output_shape(result, golden['expected_output'], eval_result)
            if not eval_result.passed:
                for err in eval_result.errors:
                    report.fail(err)

        reports.append(report)

    return reports

