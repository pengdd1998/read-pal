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

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.prompts import (
    COACH_ASSESSMENT_HUMAN,
    COACH_ASSESSMENT_SYSTEM,
    CONCEPT_MAP_HUMAN,
    CONCEPT_MAP_SYSTEM,
    CONTRADICTIONS_HUMAN,
    CONTRADICTIONS_SYSTEM,
    CONVERSATION_SUMMARY_HUMAN,
    CONVERSATION_SUMMARY_SYSTEM,
    CROSS_BOOK_SYNTHESIS_HUMAN,
    CROSS_BOOK_SYNTHESIS_SYSTEM,
    CROSS_REFERENCE_HUMAN,
    CROSS_REFERENCE_SYSTEM,
    READING_PLAN_HUMAN,
    READING_PLAN_SYSTEM,
    RESEARCH_HUMAN,
    RESEARCH_SYSTEM,
    SUMMARY_REPORT_HUMAN,
    SUMMARY_REPORT_SYSTEM,
    STUDY_CONCEPT_CHECKS_HUMAN,
    STUDY_CONCEPT_CHECKS_SYSTEM,
    STUDY_OBJECTIVES_HUMAN,
    STUDY_OBJECTIVES_SYSTEM,
    SYNTHESIS_HUMAN,
    SYNTHESIS_SYSTEM,
)
from app.schemas.llm_outputs import (
    CoachReport,
    ConceptCheckList,
    ConceptMapResult,
    ContradictionList,
    ConversationSummaryData,
    CrossBookComparison,
    CrossReferenceResult,
    ResearchBrief,
    StudyObjectiveList,
    SummaryReportResult,
)
from app.services.llm import safe_llm_call, safe_llm_invoke
from app.utils.sanitizer import sanitize_book_field, sanitize_user_input
from app.config import get_settings
from app.utils.token_budget import TokenBudget


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
    budget = TokenBudget(model=get_settings().default_model)
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


async def _research_agent(input_data: dict[str, Any]) -> tuple[Any, int]:
    """Build + call the Research agent prompt with golden-provided sources.

    Mirrors ``app.services.agent.research.run_research``'s synthesis step
    (sanitize → numbered sources → cited JSON brief). The retrieval step
    is DB-bound and out of scope here; the golden provides the sources a
    real cross-book search would have produced.
    """
    question = sanitize_user_input(
        input_data.get('question', ''), max_length=2000, context='research_question',
    )
    sources = sanitize_user_input(
        input_data.get('sources', ''), max_length=4000, context='research_sources',
    )

    system_text = RESEARCH_SYSTEM.template
    human_text = RESEARCH_HUMAN.template.format(question=question, sources=sources)
    messages = [SystemMessage(content=system_text), HumanMessage(content=human_text)]
    result = await safe_llm_invoke(
        messages,
        fallback=ResearchBrief().model_dump(),
        log_label='live-eval/research-agent',
        schema_class=ResearchBrief,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=RESEARCH_SYSTEM,
        use_cache=False,
    )
    return result, RESEARCH_SYSTEM.version


async def _coach_agent(input_data: dict[str, Any]) -> tuple[Any, int]:
    """Build + call the Coach assessment prompt with golden-provided signals.

    Mirrors ``app.services.agent.coach.run_coach_report``'s LLM step; the
    DB signal/excerpt collection is out of scope — the golden provides
    the exact blocks the service would have formatted.
    """
    book_title = sanitize_book_field(input_data.get('book_title'), field='title')
    author = sanitize_book_field(input_data.get('author'), field='author') or 'Unknown'
    progress = sanitize_user_input(
        input_data.get('progress', ''), max_length=200, context='coach_progress',
    )
    signals = sanitize_user_input(
        input_data.get('signals', ''), max_length=2000, context='coach_signals',
    )
    recent = sanitize_user_input(
        input_data.get('recent_content', ''), max_length=4000, context='coach_recent',
    )

    messages = [
        SystemMessage(content=COACH_ASSESSMENT_SYSTEM.template),
        HumanMessage(content=COACH_ASSESSMENT_HUMAN.template.format(
            title=book_title, author=author, progress=progress,
            signals=signals, recent_content=recent,
        )),
    ]
    result = await safe_llm_invoke(
        messages,
        fallback=CoachReport().model_dump(),
        log_label='live-eval/coach-agent',
        schema_class=CoachReport,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=COACH_ASSESSMENT_SYSTEM,
        use_cache=False,
    )
    return result, COACH_ASSESSMENT_SYSTEM.version


def _synthesis_mode_messages(system_tmpl, human_tmpl, fmt: dict[str, Any]):
    """Shared prompt construction for the four synthesis mode goldens."""
    for key in fmt:
        fmt[key] = sanitize_user_input(
            str(fmt[key]), max_length=4000, context=f'sm_{key}',
        )
    return [
        SystemMessage(content=system_tmpl.template),
        HumanMessage(content=human_tmpl.template.format(**fmt)),
    ]


async def _synthesis_cross_reference(input_data: dict[str, Any]) -> tuple[Any, int]:
    messages = _synthesis_mode_messages(
        CROSS_REFERENCE_SYSTEM, CROSS_REFERENCE_HUMAN,
        {
            'concept': input_data.get('concept', ''),
            'analysis_type': input_data.get('analysis_type', 'all'),
            'source_title': sanitize_book_field(input_data.get('source_title'), field='title'),
            'source_author': sanitize_book_field(input_data.get('source_author'), field='author') or 'Unknown',
            'sources': input_data.get('sources', ''),
        },
    )
    result = await safe_llm_invoke(
        messages,
        fallback=CrossReferenceResult().model_dump(),
        log_label='live-eval/synthesis-cross-reference',
        schema_class=CrossReferenceResult,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=CROSS_REFERENCE_SYSTEM,
        use_cache=False,
    )
    return result, CROSS_REFERENCE_SYSTEM.version


async def _synthesis_concept_map(input_data: dict[str, Any]) -> tuple[Any, int]:
    messages = _synthesis_mode_messages(
        CONCEPT_MAP_SYSTEM, CONCEPT_MAP_HUMAN,
        {
            'topic': input_data.get('topic', ''),
            'max_nodes': input_data.get('max_nodes', 20),
            'sources': input_data.get('sources', ''),
        },
    )
    result = await safe_llm_invoke(
        messages,
        fallback=ConceptMapResult().model_dump(),
        log_label='live-eval/synthesis-concept-map',
        schema_class=ConceptMapResult,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=CONCEPT_MAP_SYSTEM,
        use_cache=False,
    )
    return result, CONCEPT_MAP_SYSTEM.version


async def _synthesis_contradictions(input_data: dict[str, Any]) -> tuple[Any, int]:
    messages = _synthesis_mode_messages(
        CONTRADICTIONS_SYSTEM, CONTRADICTIONS_HUMAN,
        {
            'min_severity': input_data.get('min_severity', 'medium'),
            'topic_clause': input_data.get('topic_clause', ''),
            'sources': input_data.get('sources', ''),
        },
    )
    result = await safe_llm_invoke(
        messages,
        fallback=ContradictionList().model_dump(),
        log_label='live-eval/synthesis-contradictions',
        schema_class=ContradictionList,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=CONTRADICTIONS_SYSTEM,
        use_cache=False,
    )
    return result, CONTRADICTIONS_SYSTEM.version


async def _synthesis_summary_report(input_data: dict[str, Any]) -> tuple[Any, int]:
    messages = _synthesis_mode_messages(
        SUMMARY_REPORT_SYSTEM, SUMMARY_REPORT_HUMAN,
        {
            'report_format': input_data.get('report_format', 'structured'),
            'focus_clause': input_data.get('focus_clause', ''),
            'data': input_data.get('data', ''),
        },
    )
    result = await safe_llm_invoke(
        messages,
        fallback=SummaryReportResult().model_dump(),
        log_label='live-eval/synthesis-summary-report',
        schema_class=SummaryReportResult,
        user_id=LIVE_EVAL_USER_ID,
        book_id=None,
        template=SUMMARY_REPORT_SYSTEM,
        use_cache=False,
    )
    return result, SUMMARY_REPORT_SYSTEM.version


_LIVE_HANDLERS: dict[tuple[str, str], Any] = {
    ('study_mode', 'generate_objectives'): _study_objectives,
    ('study_mode', 'generate_concept_checks'): _study_concept_checks,
    ('synthesis', 'synthesize'): _synthesis_single,
    ('synthesis', 'cross_book'): _synthesis_cross_book,
    ('synthesis', 'cross_reference'): _synthesis_cross_reference,
    ('synthesis', 'concept_map'): _synthesis_concept_map,
    ('synthesis', 'contradictions'): _synthesis_contradictions,
    ('synthesis', 'summary_report'): _synthesis_summary_report,
    ('conversation_memory', 'summarize'): _conversation_summary,
    ('conversation_memory', 'summarize_with_prior'): _conversation_summary_with_prior,
    ('reading_plan', 'generate'): _reading_plan,
    ('research_agent', 'synthesize'): _research_agent,
    ('coach_agent', 'assess'): _coach_agent,
}
