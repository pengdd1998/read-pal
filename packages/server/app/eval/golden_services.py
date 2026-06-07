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
