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
import uuid
from dataclasses import dataclass, field
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.eval.assertions import EvalResult, validate_output_shape
from app.eval.golden_dataset import ALL_GOLDEN
from app.prompts import (
    CONVERSATION_SUMMARY_HUMAN,
    CONVERSATION_SUMMARY_SYSTEM,
    CROSS_BOOK_SYNTHESIS_HUMAN,
    CROSS_BOOK_SYNTHESIS_SYSTEM,
    READING_PLAN_HUMAN,
    READING_PLAN_SYSTEM,
    STUDY_CONCEPT_CHECKS_HUMAN,
    STUDY_CONCEPT_CHECKS_SYSTEM,
    STUDY_OBJECTIVES_HUMAN,
    STUDY_OBJECTIVES_SYSTEM,
    SYNTHESIS_HUMAN,
    SYNTHESIS_SYSTEM,
)
from app.schemas.llm_outputs import (
    ConceptCheckList,
    ConversationSummaryData,
    CrossBookComparison,
    StudyObjectiveList,
)
from app.services.llm import safe_llm_call, safe_llm_invoke
from app.utils.sanitizer import sanitize_book_field, sanitize_user_input
from app.utils.token_budget import TokenBudget, estimate_tokens

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

    def fail(self, msg: str) -> None:
        self.passed = False
        self.errors.append(msg)


# ---------------------------------------------------------------------------
# Handler dispatch table
# ---------------------------------------------------------------------------

async def _study_objectives(input_data: dict[str, Any]) -> tuple[Any, int]:
    """Build + call study objectives prompt."""
    chapter_title = input_data.get('chapter_title', 'Untitled Chapter')
    safe_title = sanitize_user_input(chapter_title, max_length=500, context='chapter_title')
    system_text = STUDY_OBJECTIVES_SYSTEM.template
    human_text = STUDY_OBJECTIVES_HUMAN.template.format(
        chapter_index=1, chapter_title=safe_title,
    )
    messages = [SystemMessage(content=system_text), HumanMessage(content=human_text)]
    result = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='live-eval/study-objectives',
        schema_class=StudyObjectiveList,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=STUDY_OBJECTIVES_SYSTEM,
        use_cache=False,
    )
    return result, STUDY_OBJECTIVES_SYSTEM.version


async def _study_concept_checks(input_data: dict[str, Any]) -> tuple[Any, int]:
    """Build + call study concept checks prompt."""
    concepts = input_data.get('concepts', [])
    system_text = STUDY_CONCEPT_CHECKS_SYSTEM.template
    human_text = STUDY_CONCEPT_CHECKS_HUMAN.template.format(
        concepts=', '.join(concepts) if isinstance(concepts, list) else str(concepts),
    )
    messages = [SystemMessage(content=system_text), HumanMessage(content=human_text)]
    result = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='live-eval/study-concept-checks',
        schema_class=ConceptCheckList,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=STUDY_CONCEPT_CHECKS_SYSTEM,
        use_cache=False,
    )
    return result, STUDY_CONCEPT_CHECKS_SYSTEM.version


async def _synthesis_single(input_data: dict[str, Any]) -> tuple[Any, int]:
    """Build + call single-book synthesis prompt."""
    book = input_data.get('book', {})
    safe_title = sanitize_book_field(book.get('title'), field='title')
    safe_author = sanitize_book_field(book.get('author'), field='author')
    system_text = SYNTHESIS_SYSTEM.template
    human_text = SYNTHESIS_HUMAN.template.format(
        title=safe_title, author=safe_author,
    )
    messages = [SystemMessage(content=system_text), HumanMessage(content=human_text)]
    from app.schemas.llm_outputs import SynthesisResult
    result = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='live-eval/synthesis',
        schema_class=SynthesisResult,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=SYNTHESIS_SYSTEM,
        use_cache=False,
    )
    return result, SYNTHESIS_SYSTEM.version


async def _synthesis_cross_book(input_data: dict[str, Any]) -> tuple[Any, int]:
    """Build + call cross-book synthesis prompt with golden-provided data."""
    books = input_data.get('books', [])
    budget = TokenBudget()
    budgeted = budget.add(json.dumps(books, default=str), 'cross_book_data')
    system_text = CROSS_BOOK_SYNTHESIS_SYSTEM.template
    human_text = CROSS_BOOK_SYNTHESIS_HUMAN.template.format(data=budgeted)
    messages = [SystemMessage(content=system_text), HumanMessage(content=human_text)]
    result = await safe_llm_invoke(
        messages,
        fallback=CrossBookComparison().model_dump(),
        log_label='live-eval/cross-book',
        schema_class=CrossBookComparison,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=CROSS_BOOK_SYNTHESIS_SYSTEM,
        use_cache=False,
    )
    return result, CROSS_BOOK_SYNTHESIS_SYSTEM.version


async def _conversation_summary(input_data: dict[str, Any]) -> tuple[Any, int]:
    """Build + call conversation summary prompt."""
    messages_raw = input_data.get('messages', [])
    # Format as the production service does: alternating role lines
    formatted_lines = []
    for m in messages_raw:
        role = m.get('role', 'user')
        content = m.get('content', '')
        safe = sanitize_user_input(content, max_length=2000, context=f'msg_{role}')
        formatted_lines.append(f'{role}: {safe}')
    formatted = '\n'.join(formatted_lines)

    system_text = CONVERSATION_SUMMARY_SYSTEM.template
    human_text = CONVERSATION_SUMMARY_HUMAN.template.format(conversation=formatted)
    messages = [SystemMessage(content=system_text), HumanMessage(content=human_text)]
    result = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='live-eval/conversation-summary',
        schema_class=ConversationSummaryData,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=CONVERSATION_SUMMARY_SYSTEM,
        use_cache=False,
    )
    return result, CONVERSATION_SUMMARY_SYSTEM.version


async def _conversation_summary_with_prior(input_data: dict[str, Any]) -> tuple[Any, int]:
    """CC-3: exercise the summary-aware prompt path (prior summary as preamble).

    Mirrors ``app.services.conversation_memory._build_summary_prompt``: when
    an existing summary is provided, it's prepended to the human message as
    context for the model to merge with new conversation topics. Without this
    handler, live eval skips the entire context-assembly-with-prior-summary
    codepath — a regression in summary-aware prompt construction would pass.
    """
    messages_raw = input_data.get('messages', [])
    existing_summary = input_data.get('existing_summary', '')

    formatted_lines = []
    for m in messages_raw:
        role = m.get('role', 'user')
        content = m.get('content', '')
        safe = sanitize_user_input(content, max_length=2000, context=f'msg_{role}')
        formatted_lines.append(f'{role}: {safe}')
    formatted = '\n'.join(formatted_lines)

    if existing_summary:
        safe_summary = sanitize_user_input(
            existing_summary, max_length=2000, context='existing_summary',
        )
        preamble = (
            f'Existing summary:\n{safe_summary}\n\n'
            'Update this summary to incorporate the new conversation below:'
        )
    else:
        preamble = 'New conversation to summarize:'

    system_text = CONVERSATION_SUMMARY_SYSTEM.template
    human_text = (
        f'{preamble}\n\nConversation:\n{formatted}'
    )
    messages = [SystemMessage(content=system_text), HumanMessage(content=human_text)]
    result = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='live-eval/conversation-summary-with-prior',
        schema_class=ConversationSummaryData,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=CONVERSATION_SUMMARY_SYSTEM,
        use_cache=False,
    )
    return result, CONVERSATION_SUMMARY_SYSTEM.version


async def _reading_plan(input_data: dict[str, Any]) -> tuple[Any, int]:
    """Build + call reading plan prompt. Text output, not JSON."""
    book = input_data.get('book', {})
    total_days = input_data.get('total_days', 7)
    daily_minutes = input_data.get('daily_minutes', 30)
    pages = book.get('total_pages', 0)
    current = book.get('current_page', 0)
    remaining = max(0, pages - current)
    pages_per_day = remaining // total_days if total_days > 0 else remaining

    system_text = READING_PLAN_SYSTEM.template
    human_text = READING_PLAN_HUMAN.template.format(
        total_days=total_days,
        title=sanitize_book_field(book.get('title'), field='title'),
        author=sanitize_book_field(book.get('author'), field='author'),
        pages=pages,
        current_page=current,
        remaining=remaining,
        pages_per_day=pages_per_day,
        daily_minutes=daily_minutes,
        progress=book.get('progress', 0),
    )
    messages = [SystemMessage(content=system_text), HumanMessage(content=human_text)]
    result = await safe_llm_call(
        messages,
        fallback='(fallback) 7-Day Reading Plan',
        log_label='live-eval/reading-plan',
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=READING_PLAN_SYSTEM,
        use_cache=False,
    )
    return result, READING_PLAN_SYSTEM.version


_LIVE_HANDLERS: dict[tuple[str, str], Any] = {
    ('study_mode', 'generate_objectives'): _study_objectives,
    ('study_mode', 'generate_concept_checks'): _study_concept_checks,
    ('synthesis', 'synthesize'): _synthesis_single,
    ('synthesis', 'cross_book'): _synthesis_cross_book,
    ('conversation_memory', 'summarize'): _conversation_summary,
    ('conversation_memory', 'summarize_with_prior'): _conversation_summary_with_prior,
    ('reading_plan', 'generate'): _reading_plan,
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

async def run_live_eval(
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
            eval_result = EvalResult(name, service, action)
            validate_output_shape(result, golden['expected_output'], eval_result)
            if not eval_result.passed:
                for err in eval_result.errors:
                    report.fail(err)

        reports.append(report)

    return reports


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
) -> int:
    """Entry point. Returns exit code (0 = pass, 1 = any failure)."""
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
    return 0 if success else 1


if __name__ == '__main__':
    import sys
    logging.basicConfig(level=logging.INFO)
    sys.exit(main())
