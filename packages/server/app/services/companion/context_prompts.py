"""Prompt building and message assembly for companion context."""

import structlog
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.models.book import Book
from app.prompts.templates import FRIEND_PERSONAS
from app.utils.i18n import DEFAULT_LANGUAGE, t
from app.utils.sanitizer import (
    sanitize_annotations,
    sanitize_chat_message,
    sanitize_user_input,
)
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.companion')

# Genre-specific prompt modifiers appended after the base system prompt
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
        title=book.title, author=book.author,
        progress=book.progress, current_page=book.current_page,
        total_pages=book.total_pages,
    )

    # Apply genre-specific focus modifier
    if genre and genre in GENRE_MODIFIERS:
        prompt += GENRE_MODIFIERS[genre]
    if annotations_ctx:
        safe_annotations = sanitize_annotations(annotations_ctx)
        prompt += t('companion.annotations_context', lang, annotations=safe_annotations)
    if rag_ctx:
        safe_rag = sanitize_user_input(rag_ctx, max_length=3000, context='rag_context')
        prompt += t('companion.rag_context', lang, context=safe_rag)
    if memory_summary:
        prompt += t('companion.memory_context', lang, summary=memory_summary)
    if context:
        extra_parts = build_extra_context_parts(context, lang)
        if extra_parts:
            prompt += '\n\n' + '\n\n'.join(extra_parts)

    # Enforce token budget on the assembled context BEFORE appending the persona,
    # so the (small, essential) persona is never the part truncated away. Genre
    # and base prompt sit at the start of the string, so end-truncation preserves
    # them too; only the tail of the heaviest late section is at risk.
    if budget:
        prompt = budget.add(prompt, 'system_prompt')

    # Apply persona personality if provided (kept out of budget truncation)
    if persona and persona in FRIEND_PERSONAS:
        prompt += '\n\n' + FRIEND_PERSONAS[persona].template

    return prompt


def build_messages(
    system_text: str,
    history: list[HumanMessage | AIMessage],
    message: str,
    budget: TokenBudget,
) -> list[SystemMessage | HumanMessage | AIMessage]:
    """Build the LLM message list from system prompt, history, and user message."""
    sanitized_message = sanitize_chat_message(message)
    messages = [SystemMessage(content=system_text)] + history
    messages.append(HumanMessage(content=sanitized_message))
    if budget.truncations:
        logger.warning(
            'companion.chat.budget_truncated',
            truncations=', '.join(budget.truncations),
        )
    return messages
