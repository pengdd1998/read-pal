"""Golden test cases for study mode, knowledge, synthesis, memory book, reading plan, and conversation services."""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Study mode service
# ---------------------------------------------------------------------------

STUDY_OBJECTIVES: dict[str, Any] = {
    'service': 'study_mode',
    'action': 'generate_objectives',
    'input': {
        'book_title': 'Introduction to Algorithms',
        'chapter_title': 'Chapter 3: Growth of Functions',
    },
    'expected_output': {
        'type': 'dict',
        'required_keys': ['objectives'],
        'key_types': {
            'objectives': 'list',
        },
    },
}

STUDY_CONCEPT_CHECKS: dict[str, Any] = {
    'service': 'study_mode',
    'action': 'generate_concept_checks',
    'input': {
        'book_title': 'Introduction to Algorithms',
        'concepts': ['Big-O notation', 'asymptotic bounds', 'recurrence relations'],
    },
    'expected_output': {
        'type': 'dict',
        'required_keys': ['checks'],
        'key_types': {
            'checks': 'list',
        },
    },
}

# ---------------------------------------------------------------------------
# Knowledge extraction
# ---------------------------------------------------------------------------

KNOWLEDGE_EXTRACTION: dict[str, Any] = {
    'service': 'knowledge',
    'action': 'extract_concepts',
    'input': {
        'annotations': [
            {'content': 'The protagonist represents the American Dream'},
            {'content': 'The green light symbolizes hope and desire'},
        ],
    },
    'expected_output': {
        'type': 'dict',
        'required_keys': ['concepts'],
        'key_types': {
            'concepts': 'list',
        },
    },
}

# ---------------------------------------------------------------------------
# Synthesis service
# ---------------------------------------------------------------------------

SINGLE_BOOK_SYNTHESIS: dict[str, Any] = {
    'service': 'synthesis',
    'action': 'synthesize',
    'input': {
        'book': {
            'title': 'The Great Gatsby',
            'author': 'F. Scott Fitzgerald',
        },
    },
    'expected_output': {
        'type': 'dict',
        'required_keys': ['themes', 'connections'],
        'key_types': {
            'themes': 'list',
            'connections': 'list',
        },
    },
}

CROSS_BOOK_SYNTHESIS: dict[str, Any] = {
    'service': 'synthesis',
    'action': 'cross_book',
    'input': {
        'books': ['Book A', 'Book B'],
    },
    'expected_output': {
        'type': 'dict',
        'required_keys': ['common_themes'],
        'key_types': {
            'common_themes': 'list',
        },
    },
}

# ---------------------------------------------------------------------------
# Memory book
# ---------------------------------------------------------------------------

MEMORY_BOOK_COVER: dict[str, Any] = {
    'service': 'memory_book',
    'action': 'chapter_1_cover',
    'input': {
        'book': {
            'title': 'The Great Gatsby',
            'author': 'F. Scott Fitzgerald',
        },
    },
    'expected_output': {
        'type': 'dict',
        'required_keys': ['title'],
        'key_types': {
            'title': 'str',
        },
    },
}

MEMORY_BOOK_JOURNEY: dict[str, Any] = {
    'service': 'memory_book',
    'action': 'chapter_2_journey',
    'input': {
        'book_title': 'The Great Gatsby',
        'sessions': [
            {'date': '2026-04-01', 'pages_read': 30, 'duration': 45},
        ],
    },
    'expected_output': {
        'type': 'dict',
        'required_keys': ['timeline'],
        'key_types': {
            'timeline': 'list',
        },
    },
}

# ---------------------------------------------------------------------------
# Reading plan
# ---------------------------------------------------------------------------

READING_PLAN: dict[str, Any] = {
    'service': 'reading_plan',
    'action': 'generate',
    'input': {
        'book': {
            'title': 'Sapiens',
            'author': 'Yuval Noah Harari',
            'total_pages': 400,
            'current_page': 0,
        },
        'total_days': 7,
        'daily_minutes': 30,
    },
    'expected_output': {
        'type': 'str',
        'min_length': 50,
        'contains': ['Day'],
        'not_empty': True,
    },
}

# ---------------------------------------------------------------------------
# Conversation summary
# ---------------------------------------------------------------------------

CONVERSATION_SUMMARY: dict[str, Any] = {
    'service': 'conversation_memory',
    'action': 'summarize',
    'input': {
        'messages': [
            {'role': 'user', 'content': 'What does the green light symbolize?'},
            {'role': 'assistant', 'content': 'The green light represents Gatsby\'s hopes and dreams.'},
        ],
    },
    'expected_output': {
        'type': 'dict',
        'required_keys': ['key_topics'],
        'key_types': {
            'key_topics': 'list',
        },
    },
}

# CC-3 (post-rollout review): summary-aware variant. Exercises the path
# where an EXISTING summary is fed back into the prompt (the production
# hot path for long conversations). Without this entry, live eval skips
# the entire context-assembly-with-prior-summary codepath.
CONVERSATION_SUMMARY_WITH_PRIOR: dict[str, Any] = {
    'service': 'conversation_memory',
    'action': 'summarize_with_prior',
    'description': 'Summary regeneration with existing summary as preamble',
    'input': {
        'messages': [
            {'role': 'user', 'content': 'Tell me about the valley of ashes.'},
            {'role': 'assistant', 'content': 'It represents moral decay beneath the surface wealth.'},
            {'role': 'user', 'content': 'And the eyes of T.J. Eckleburg?'},
            {'role': 'assistant', 'content': 'They symbolize a godlike figure watching over the moral wasteland.'},
        ],
        'existing_summary': 'Earlier discussion focused on the green light as a symbol of Gatsby\'s hopes and the American Dream.',
    },
    'expected_output': {
        'type': 'dict',
        'required_keys': ['key_topics'],
        'key_types': {
            'key_topics': 'list',
        },
    },
}

# ---------------------------------------------------------------------------
# Research agent (Phase 2 multi-agent)
# ---------------------------------------------------------------------------

RESEARCH_BRIEF: dict[str, Any] = {
    'service': 'research_agent',
    'action': 'synthesize',
    'input': {
        'question': 'How do these books portray the American Dream?',
        'sources': (
            '[1] The Great Gatsby — F. Scott Fitzgerald — Chapter: Chapter 9\n'
            '"So we beat on, boats against the current, borne back ceaselessly '
            'into the past."\n\n'
            '[2] Death of a Salesman — Arthur Miller — Chapter: Requiem\n'
            '"He had the wrong dreams. All, all, wrong."'
        ),
    },
    'expected_output': {
        'type': 'dict',
        'required_keys': ['summary', 'findings'],
        'key_types': {
            'summary': 'str',
            'findings': 'list',
        },
    },
}
