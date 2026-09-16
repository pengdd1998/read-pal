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
import os
import time



from app.eval.live._report import LiveEvalReport
from app.eval.live._runner import run_live_eval  # noqa: E402

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



def _resolve_model_name() -> str | None:
    """Best-effort model attribution for the report."""
    try:
        from app.config import get_settings
        return get_settings().default_model
    except Exception:  # noqa: BLE001 — attribution only
        return None


def print_live_report(reports: list[LiveEvalReport]) -> bool:
    """Print live eval report. Returns True if all non-skipped entries passed."""
    ran = [r for r in reports if not r.skipped]
    skipped = [r for r in reports if r.skipped]
    passed = sum(1 for r in ran if r.passed)
    failed = sum(1 for r in ran if not r.passed)

    print(f'\n{"=" * 60}')
    print(f'LIVE EVAL RESULTS: {passed}/{len(ran)} passed, {failed} failed, '
          f'{len(skipped)} skipped')
    print(f'{"=" * 60}')

    for r in reports:
        if r.skipped:
            icon = 'SKIP'
            print(f'  {icon} {r.service}/{r.action} — {r.skip_reason}')
        elif r.passed:
            icon = 'PASS'
            print(f'  {icon} {r.service}/{r.action} — {r.latency_ms}ms, '
                  f'v{r.prompt_version}, ~{r.tokens_estimated} tokens')
        else:
            icon = 'FAIL'
            type_tag = f' [{r.error_type}]' if r.error_type else ''
            print(f'  {icon} {r.service}/{r.action} — {r.latency_ms}ms{type_tag}')
            for err in r.errors:
                print(f'    -> {err}')

    return failed == 0


def write_live_baseline(
    reports: list[LiveEvalReport],
    path: str = 'app/eval/live_baseline.json',
) -> None:
    """Persist live eval results as a JSON baseline.

    Used by Phase 5 drift scanner to detect prompt-quality regressions
    over time. Gitignored — regenerated per run.
    """
    serializable = [
        {
            'name': r.name,
            'service': r.service,
            'action': r.action,
            'passed': r.passed,
            'skipped': r.skipped,
            'errors': r.errors,
            'latency_ms': r.latency_ms,
            'prompt_version': r.prompt_version,
            'model_used': r.model_used,
            'tokens_estimated': r.tokens_estimated,
            'error_type': r.error_type,
        }
        for r in reports
    ]
    with open(path, 'w') as f:
        json.dump(
            {
                'generated_at': time.time(),
                'reports': serializable,
            },
            f,
            indent=2,
        )
    logger.info('live_eval.baseline_written', path=path, count=len(serializable))


def main(
    label_filter: str | None = None,
    max_tokens: int | None = None,
    judge: bool = False,
) -> int:
    """Entry point. Returns exit code (0 = pass, 1 = any failure).

    ``judge=True`` adds the L2 LLM-as-judge pass (engineering-upgrade B3):
    each non-skipped entry's captured output is scored 1-5 against its
    golden expectation via ``app.eval.judges``. Adds ~1K real tokens per
    scored entry on top of the handler calls.
    """
    cap = max_tokens if max_tokens is not None else int(
        os.environ.get('MAX_LIVE_EVAL_TOKENS', DEFAULT_MAX_LIVE_TOKENS)
    )

    if not os.environ.get('PROMPT_EVAL_API_KEY') and not os.environ.get('GLM_API_KEY'):
        print('ERROR: PROMPT_EVAL_API_KEY (or GLM_API_KEY) not set')
        return 2

    reports = asyncio.run(run_live_eval(label_filter=label_filter, max_tokens=cap))
    success = print_live_report(reports)
    try:
        write_live_baseline(reports)
    except Exception as exc:  # noqa: BLE001 — baseline write is best-effort
        logger.warning('live_eval.baseline_write_failed', error=str(exc)[:200])
    if judge:
        from app.eval.judges import print_judge_report, score_live_reports

        scored = asyncio.run(score_live_reports(reports))
        print_judge_report(scored)
    return 0 if success else 1


if __name__ == '__main__':
    import sys
    logging.basicConfig(level=logging.INFO)
    sys.exit(main())
