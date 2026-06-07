"""Synthesis, reading plan, and conversation memory prompt templates."""

from __future__ import annotations

from app.prompts.base import PromptTemplate

# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

SYNTHESIS_SYSTEM = PromptTemplate(
    key='synthesis.single_book.system',
    version=1,
    template=(
        'You are a literary analysis assistant. Analyze the provided reading data '
        'and return a structured synthesis. Return ONLY valid JSON with these keys: '
        '"themes" (array of {{name, description, confidence 0-1}}), '
        '"connections" (array of {{from_topic, to_topic, description}}), '
        '"timeline" (array of {{date, event}}), '
        '"insights" (array of strings). '
        'Be specific and data-driven in your analysis.'
    ),
    output_format='json',
)

SYNTHESIS_HUMAN = PromptTemplate(
    key='synthesis.single_book.human',
    version=1,
    template='Analyze the reading data for "{title}" by {author}:\n\n{data}',
    variables=['title', 'author', 'data'],
    output_format='text',
)

CROSS_BOOK_SYNTHESIS_SYSTEM = PromptTemplate(
    key='synthesis.cross_book.system',
    version=1,
    template=(
        'You are a literary analysis assistant. Compare reading data across multiple '
        'books and find connections. Return ONLY valid JSON with these keys: '
        '"common_themes" (array of {{name, description, confidence}}), '
        '"unique_perspectives" (array of {{book, perspective}}), '
        '"recommended_connections" (array of strings suggesting further reading connections).'
    ),
    output_format='json',
)

CROSS_BOOK_SYNTHESIS_HUMAN = PromptTemplate(
    key='synthesis.cross_book.human',
    version=1,
    template='Compare these books and find cross-book connections:\n\n{data}',
    variables=['data'],
    output_format='text',
)

BOOK_COMPARE_SYSTEM = PromptTemplate(
    key='synthesis.compare.system',
    version=1,
    template=(
        'You are a literary comparison assistant. Compare exactly two books and '
        'provide a focused analysis. Return ONLY valid JSON with these keys: '
        '"common_themes" (array of {{name, description, confidence}} objects '
        'describing themes shared by both books), '
        '"unique_perspectives" (array of {{book, perspective}} objects '
        'describing what each book uniquely contributes), '
        '"recommended_connections" (array of strings suggesting further '
        'reading connections between the ideas in these two books).'
    ),
    output_format='json',
)

BOOK_COMPARE_HUMAN = PromptTemplate(
    key='synthesis.compare.human',
    version=1,
    template=(
        'Compare "{title_1}" by {author_1} and "{title_2}" by {author_2}.\n\n'
        'Book 1 data:\n{data_1}\n\n'
        'Book 2 data:\n{data_2}'
    ),
    variables=['title_1', 'author_1', 'title_2', 'author_2', 'data_1', 'data_2'],
    output_format='text',
)

# ---------------------------------------------------------------------------
# Reading plan
# ---------------------------------------------------------------------------

READING_PLAN_SYSTEM = PromptTemplate(
    key='reading_plan.system',
    version=1,
    template=(
        'You are a reading plan creator. Generate a structured, day-by-day reading plan.\n'
        'Return the plan as plain text with this format:\n'
        'Day 1: [Section/chapter] ([estimated pages])\n'
        '  - Focus: [what to pay attention to]\n'
        '  - Question to consider: [thought-provoking question]\n\n'
        'Keep each day concise (2-3 lines). Be specific about the book content.'
    ),
    output_format='text',
)

READING_PLAN_HUMAN = PromptTemplate(
    key='reading_plan.human',
    version=1,
    template=(
        'Create a {total_days}-day reading plan for "{title}" by {author}.\n'
        'Total pages: {pages}, current page: {current_page}, remaining: {remaining}\n'
        'Pages per day: ~{pages_per_day}\n'
        'Daily reading time: ~{daily_minutes} minutes\n'
        'Progress so far: {progress}%'
    ),
    variables=[
        'total_days', 'title', 'author', 'pages',
        'current_page', 'remaining', 'pages_per_day',
        'daily_minutes', 'progress',
    ],
    output_format='text',
)

# ---------------------------------------------------------------------------
# Conversation memory
# ---------------------------------------------------------------------------

CONVERSATION_SUMMARY_SYSTEM = PromptTemplate(
    key='conversation_memory.summary.system',
    version=1,
    template=(
        'You are a conversation summarizer. Given a conversation between a reader '
        'and an AI reading companion, produce a structured summary.\n'
        'Return ONLY valid JSON with keys:\n'
        '"key_topics" (array of strings, max 5),\n'
        '"insights" (array of strings, max 5),\n'
        '"unresolved_questions" (array of strings, max 3).\n'
        'Be concise and factual.'
    ),
    output_format='json',
)

CONVERSATION_SUMMARY_HUMAN = PromptTemplate(
    key='conversation_memory.summary.human',
    version=1,
    template='Generate the updated conversation summary.',
    output_format='text',
)
