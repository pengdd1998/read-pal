"""Prompt building and message assembly for companion context."""

import structlog
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.models.book import Book
from app.prompts.templates import FRIEND_PERSONAS
from app.utils.i18n import DEFAULT_LANGUAGE, t
from app.utils.sanitizer import (
    MAX_CHAT_MESSAGE_LENGTH,
    sanitize_annotations,
    sanitize_book_field,
    sanitize_chat_message,
    sanitize_user_input,
)
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.companion')

# Prefix of the sanitizer's data-wrap boundary (``[BEGIN USER PROVIDED DATA
# …]``). ``sanitize_user_input`` wraps suspected-injection text in these
# markers but does NOT neutralize the pattern itself, so re-sanitizing
# wrapped text wraps it AGAIN (marker stacking). Callers that sanitize at
# persist time and again at prompt-build time need ``sanitize_for_llm`` for
# idempotence.
_DATA_WRAP_PREFIX = '[BEGIN USER'


def sanitize_for_llm(content: str) -> str:
    """Idempotent wrapper around ``sanitize_chat_message``.

    Returns already-wrapped content unchanged so persist-time sanitization
    (save_message) followed by prompt-build sanitization doesn't stack data
    markers on a legitimate message. Oversized wrapped text still falls
    through so the length truncation can't be bypassed by mimicking the
    marker prefix.
    """
    if not content:
        return content
    already_wrapped = (
        content.lstrip().startswith(_DATA_WRAP_PREFIX)
        and len(content) <= MAX_CHAT_MESSAGE_LENGTH
    )
    if already_wrapped:
        return content
    return sanitize_chat_message(content)


def _is_book_completed(book: Book) -> bool:
    """P2.2: detect when the user has finished the book.

    Three signals, any one is sufficient:
    - ``status == 'completed'`` (canonical — set when the reader reaches the end)
    - ``progress >= 100`` (decimal percent; defensive against status drift)
    - ``total_pages > 0 and current_page >= total_pages`` (page-level signal)

    Defensively coerces numeric fields via ``int()`` so test fakes using
    ``MagicMock`` (which returns non-comparable attributes) don't crash —
    they fall through to "not completed", which is the safe default.
    """
    if getattr(book, 'status', None) == 'completed':
        return True
    try:
        if float(getattr(book, 'progress', 0) or 0) >= 100:
            return True
    except (TypeError, ValueError):
        pass
    try:
        total = int(getattr(book, 'total_pages', 0) or 0)
        current = int(getattr(book, 'current_page', 0) or 0)
        if total > 0 and current >= total:
            return True
    except (TypeError, ValueError):
        pass
    return False


def _is_progress_unknown(book: Book) -> bool:
    """P2.2: detect when page-level progress is unknown.

    True when ``total_pages`` is missing/zero OR the user hasn't started
    (current_page == 0). In this state we can't tell the model which page
    to stop at, so we use a conservative "early stage" warning instead of
    the specific page-number spoiler block.

    Defensive coercion handles test fakes (MagicMock) that return
    non-numeric attributes — they fall through to "unknown", which keeps
    the spoiler-prevention path conservative.
    """
    try:
        total = int(getattr(book, 'total_pages', 0) or 0)
        current = int(getattr(book, 'current_page', 0) or 0)
    except (TypeError, ValueError):
        return True
    return total <= 0 or current <= 0


def _build_spoiler_block(book: Book, lang: str) -> str:
    """P2.2: progress-aware spoiler block.

    Three states:
    - completed: spoiler block lifted — user finished the book
    - unknown: conservative "early stage" warning — can't cite page numbers
    - active: standard page-anchored spoiler prevention

    Previously the embedded template always emitted the active block, which
    misled the model when the user had finished the book (it would refuse
    to discuss the ending) or had unknown progress (it would see "page 0
    of 0" and behave erratically).
    """
    if _is_book_completed(book):
        return t('companion.spoiler_block_completed', lang)
    if _is_progress_unknown(book):
        return t('companion.spoiler_block_unknown', lang)
    return t(
        'companion.spoiler_block_active', lang,
        current_page=book.current_page,
        total_pages=book.total_pages,
    )


def _build_progress_line(book: Book, lang: str) -> str:
    """P2.2: progress-aware intro line for the system prompt.

    Mirrors ``_build_spoiler_block`` so the intro and the spoiler block
    stay in sync — emitting "page 250 of 500" in the intro and "page 0
    of 0" in the spoiler block (or vice versa) gave the model conflicting
    progress signals.
    """
    if _is_book_completed(book):
        return t('companion.progress_line_completed', lang)
    if _is_progress_unknown(book):
        return t('companion.progress_line_unknown', lang)
    return t(
        'companion.progress_line_active', lang,
        progress=book.progress, current_page=book.current_page,
        total_pages=book.total_pages,
    )

# Genre-specific prompt modifiers appended after the base system prompt
# P2.6: expanded from 4 to 8 genres. Common book categories (poetry, biography,
# history, philosophy) were missing — readers got the generic prompt for them,
# which meant less tailored guidance. 'default' is intentionally absent:
# it's the no-op "no special handling" signal in the Literal enum.
GENRE_MODIFIERS: dict[str, str] = {
    'fiction': (
        '\n\nGENRE CONTEXT: This is a fiction book. Focus your discussion on:\n'
        '- Characters: motivations, development, relationships, conflicts\n'
        '- Plot: narrative structure, pacing, foreshadowing, symbolism\n'
        '- Themes: underlying messages, social commentary\n'
        '- Craft: writing style, point of view, tone, atmosphere\n'
        'Avoid giving away spoilers beyond the current reading position.'
    ),
    'nonfiction': (
        '\n\nGENRE CONTEXT: This is a non-fiction book. Focus your discussion on:\n'
        '- Core arguments: thesis, supporting evidence, logical structure\n'
        '- Key insights: surprising findings, paradigm shifts\n'
        '- Practical takeaways: actionable lessons, real-world applications\n'
        '- Critical analysis: strengths, weaknesses, biases, gaps in reasoning'
    ),
    'technical': (
        '\n\nGENRE CONTEXT: This is a technical book. Focus your discussion on:\n'
        '- Concepts: explain technical terms clearly with analogies\n'
        '- Step-by-step reasoning: break complex processes into understandable parts\n'
        '- Code/examples: help interpret and apply code snippets or examples\n'
        '- Prerequisites: identify what prior knowledge is assumed\n'
        '- Practical application: how to use this in real projects'
    ),
    'academic': (
        '\n\nGENRE CONTEXT: This is an academic text. Focus your discussion on:\n'
        '- Thesis and argumentation: main claims, evidence, methodology\n'
        '- Theoretical framework: key theories, models, or paradigms used\n'
        '- Critical evaluation: strengths, limitations, methodology issues\n'
        '- Connections: how this relates to broader scholarly debates\n'
        '- Implications: practical or theoretical significance of findings'
    ),
    'poetry': (
        '\n\nGENRE CONTEXT: This is a book of poetry. Focus your discussion on:\n'
        '- Imagery and metaphor: how concrete language evokes abstract ideas\n'
        '- Form and structure: line breaks, stanza shape, rhyme, rhythm\n'
        '- Voice and tone: who is speaking, and how does it shift across poems\n'
        '- Sound: alliteration, assonance, the music of the line read aloud\n'
        'Encourage the reader to read passages aloud and attend to single words.'
    ),
    'biography': (
        '\n\nGENRE CONTEXT: This is a biography or memoir. Focus your discussion on:\n'
        '- Subject and perspective: whose life, and who is telling it\n'
        '- Formative events: the choices and turning points the narrative centers\n'
        '- Reliability and bias: what the biographer chose to include or omit\n'
        '- Context: the historical, cultural, or familial backdrop shaping the life\n'
        'Treat the subject as a person, not a parable — resist tidy moralizing.'
    ),
    'history': (
        '\n\nGENRE CONTEXT: This is a history book. Focus your discussion on:\n'
        '- Sources and evidence: primary vs. secondary, what the argument rests on\n'
        '- Causation: how the author explains why events unfolded as they did\n'
        '- Perspective: whose viewpoint is centered, whose is marginalized\n'
        '- Continuity and change: what persisted, what broke, across the period\n'
        'Encourage the reader to compare the author\'s framing with other accounts.'
    ),
    'philosophy': (
        '\n\nGENRE CONTEXT: This is a philosophy book. Focus your discussion on:\n'
        '- Arguments: identify premises, conclusions, and implicit assumptions\n'
        '- Concepts: define key terms and trace how they\'re used across the work\n'
        '- Objections: steelman the strongest counterarguments the author faces\n'
        '- Stakes: what follows if the author is right (or wrong)\n'
        'Invite the reader to articulate their own position, not just summarize.'
    ),
}


def build_extra_context_parts(
    context: dict,
    lang: str,
) -> list[str]:
    """Build extra prompt sections from user-supplied context dict."""
    extra_parts: list[str] = []
    if context.get('chapterContent'):
        content = sanitize_user_input(
            context['chapterContent'], max_length=8000, context='chapter_content',
        )
        extra_parts.append(t('companion.chapter_content', lang, content=content))
    if context.get('nearbyCode'):
        safe_code = sanitize_user_input(
            context.get('nearbyCode', ''), max_length=2000, context='nearby_code',
        )
        extra_parts.append(t('companion.nearby_code', lang, code=safe_code))
    if context.get('bookDescription'):
        safe_desc = sanitize_user_input(
            context.get('bookDescription', ''), max_length=1000, context='book_description',
        )
        extra_parts.append(
            t('companion.book_description', lang, description=safe_desc),
        )
    return extra_parts


def build_system_prompt(
    book: Book,
    annotations_ctx: str,
    rag_ctx: str = '',
    memory_summary: str = '',
    companion_mode: str = 'casual',
    context: dict | None = None,
    persona: str | None = None,
    genre: str | None = None,
    lang: str = DEFAULT_LANGUAGE,
    budget: TokenBudget | None = None,
) -> str:
    """Build the system prompt from all available context with token budgeting."""
    prompt_key = (
        'companion.socratic_prompt'
        if companion_mode == 'socratic'
        else 'companion.system_prompt'
    )
    prompt = t(
        prompt_key, lang,
        title=sanitize_book_field(book.title, field='title'),
        author=sanitize_book_field(book.author, field='author'),
        progress=book.progress, current_page=book.current_page,
        total_pages=book.total_pages,
        progress_line=_build_progress_line(book, lang),
        spoiler_block=_build_spoiler_block(book, lang),
        # P4.3: prompt-injection defense. The notice teaches the model that
        # XML-tagged sections below are reference data, not instructions.
        # Without this, a malicious annotation/memory/chapter could embed
        # "ignore previous instructions..." and the model would comply.
        untrusted_notice=t('companion.untrusted_notice', lang),
    )

    # Apply genre-specific focus modifier
    if genre and genre in GENRE_MODIFIERS:
        prompt += GENRE_MODIFIERS[genre]

    # P3.4: rank optional context sections by signal density and apply the
    # budget per-section in priority order. Previously these were all
    # concatenated into one blob and a single budget.add() truncated the
    # tail wholesale — meaning if budget was tight, ALL of extra_context
    # (raw chapter content, biggest and lowest-signal) AND ALL of RAG got
    # dropped while a giant memory_summary stayed intact. Per-section
    # budgeting trims each section proportionally so high-signal content
    # survives in truncated form rather than disappearing entirely.
    #
    # Priority order (highest signal first):
    #   1. memory   — LLM-distilled user preferences; smallest, most load-bearing
    #   2. annotations — user-curated highlights; explicit signal
    #   3. rag      — auto-retrieved chunks; medium signal, larger volume
    #   4. extra    — chapter content / book description; bulk, lowest density
    optional_sections: list[tuple[int, str, str]] = []
    if memory_summary:
        # P0.2: memory_summary is LLM-generated text re-entering the system
        # prompt — indirect injection vector. Sanitize before interpolation
        # (same pattern as safe_annotations / safe_rag on adjacent lines).
        safe_memory = sanitize_user_input(memory_summary, max_length=1000, context='memory_summary')
        optional_sections.append((
            1, 'memory',
            t('companion.memory_context', lang, summary=safe_memory),
        ))
    if annotations_ctx:
        safe_annotations = sanitize_annotations(annotations_ctx)
        optional_sections.append((
            2, 'annotations',
            t('companion.annotations_context', lang, annotations=safe_annotations),
        ))
    if rag_ctx:
        safe_rag = sanitize_user_input(rag_ctx, max_length=3000, context='rag_context')
        optional_sections.append((
            3, 'rag',
            t('companion.rag_context', lang, context=safe_rag),
        ))
    if context:
        extra_parts = build_extra_context_parts(context, lang)
        if extra_parts:
            # Each extra part gets its own budget slot — chapter content
            # and book description have different relevance, and treating
            # them as one chunk would force a single all-or-nothing drop.
            for idx, part in enumerate(extra_parts):
                optional_sections.append((4 + idx, f'extra_{idx}', part))

    optional_sections.sort(key=lambda item: item[0])

    # Compute persona text first and reserve its slot in the budget up-front.
    # This ensures the persona is never truncated AND that total prompt
    # length (prompt + persona) stays within the model's context window —
    # previously the persona was appended AFTER budget truncation, which
    # could in principle overflow on smaller fallback models.
    persona_text = (
        FRIEND_PERSONAS[persona].template
        if persona and persona in FRIEND_PERSONAS
        else ''
    )
    if budget and persona_text:
        budget.add(persona_text, 'persona_reserved')

    # P3.4: pin the base system prompt BEFORE optional sections. The base
    # prompt carries role, task, format, and spoiler-prevention — losing
    # it would corrupt the model's behavior more than losing every
    # optional section combined. Pin first, then trim optional sections
    # in priority order against whatever budget remains.
    if budget:
        prompt = budget.add(prompt, 'system_prompt')
    for _prio, label, section_text in optional_sections:
        truncated = budget.add(section_text, label) if budget else section_text
        if truncated:
            prompt += truncated

    # Append persona at the end (slot already reserved).
    if persona_text:
        # P3.4: wrap persona in XML-style tags so the model can attribute
        # the persona block distinctly from the rest of the system prompt.
        prompt += f'\n\n<persona>\n{persona_text}\n</persona>'

    return prompt


def build_messages(
    system_text: str,
    history: list[HumanMessage | AIMessage],
    message: str,
    budget: TokenBudget,
) -> list[SystemMessage | HumanMessage | AIMessage]:
    """Build the LLM message list from system prompt, history, and user message.

    History is sanitized defensively (belt-and-braces): rows persisted before
    persist-time sanitization existed — or written by any other path — may
    carry unsanitized injection text that would otherwise be replayed on
    every later turn. ``sanitize_for_llm`` is idempotent, so double-wrapping
    already-clean persisted messages is impossible.
    """
    sanitized_message = sanitize_for_llm(message)
    safe_history: list[HumanMessage | AIMessage] = [
        type(msg)(content=sanitize_for_llm(str(msg.content))) for msg in history
    ]
    messages = [SystemMessage(content=system_text)] + safe_history
    messages.append(HumanMessage(content=sanitized_message))
    if budget.truncations:
        logger.warning(
            'companion.chat.budget_truncated',
            truncations=', '.join(budget.truncations),
        )
    return messages
