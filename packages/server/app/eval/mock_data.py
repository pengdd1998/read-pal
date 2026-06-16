"""Mock LLM responses and schema mapping for eval infrastructure."""

from __future__ import annotations

import json

from app.schemas.llm_outputs import (
    ConceptCheckList,
    ConceptList,
    ConversationSummaryData,
    CoverData,
    CrossBookComparison,
    ReadingJourneyData,
    StudyObjectiveList,
    SynthesisResult,
)

# ---------------------------------------------------------------------------
# Schema mapping for structured-output services
# ---------------------------------------------------------------------------

SCHEMA_MAP: dict[str, dict[str, type]] = {
    'study_mode': {
        'generate_objectives': StudyObjectiveList,
        'generate_concept_checks': ConceptCheckList,
    },
    'knowledge': {
        'extract_concepts': ConceptList,
    },
    'synthesis': {
        'synthesize': SynthesisResult,
        'cross_book': CrossBookComparison,
    },
    'memory_book': {
        'chapter_1_cover': CoverData,
        'chapter_2_journey': ReadingJourneyData,
    },
    'conversation_memory': {
        'summarize': ConversationSummaryData,
    },
}

# ---------------------------------------------------------------------------
# Mock LLM responses that match expected schemas
# ---------------------------------------------------------------------------

MOCK_RESPONSES: dict[str, dict[str, str]] = {
    'companion': {
        'chat': 'The main theme of this chapter revolves around the contrast between appearance and reality.',
        'chat_injection': "I'd be happy to discuss the book with you! What aspect interests you most?",
        'summarize': 'This book explores themes of totalitarianism, surveillance, and the power of language.',
        'explain': 'This famous opening line establishes the duality of the French Revolution era.',
    },
    'friend': {
        'chat': 'That is a profound question about existentialism. Let me share my perspective...',
        'chat_injection': "Let's focus on your reading. What passage are you referring to?",
    },
    'study_mode': {
        'generate_objectives': json.dumps({
            'objectives': [
                {'id': '1', 'text': 'Understand Big-O notation', 'completed': False},
                {'id': '2', 'text': 'Analyze asymptotic bounds', 'completed': False},
            ],
        }),
        'generate_concept_checks': json.dumps({
            'checks': [
                {
                    'id': '1',
                    'question': 'What is Big-O notation?',
                    'hint': 'Think about upper bounds',
                    'answer': 'Big-O describes the upper bound of an algorithm\'s growth rate',
                    'position': 'middle',
                },
            ],
        }),
    },
    'knowledge': {
        'extract_concepts': json.dumps({
            'concepts': [
                {'name': 'American Dream', 'type': 'theme', 'related': ['protagonist'], 'description': 'Central theme'},
                {'name': 'Green Light', 'type': 'theme', 'related': ['hope'], 'description': 'Symbol of desire'},
            ],
        }),
    },
    'synthesis': {
        'synthesize': json.dumps({
            'themes': [{'name': 'Identity', 'description': 'Search for self', 'confidence': 0.8}],
            'connections': [{'from_topic': 'Identity', 'to_topic': 'Society', 'description': 'Tension'}],
            'timeline': [{'date': '2026-04-01', 'event': 'Started reading'}],
            'insights': ['Key takeaway from the reading'],
        }),
        'cross_book': json.dumps({
            'common_themes': [{'name': 'Common theme', 'description': 'Shared', 'confidence': 0.7}],
            'unique_perspectives': [{'title': 'Book A', 'key_takeaway': 'Takeaway A'}],
            'recommended_connections': ['Related themes'],
        }),
    },
    'memory_book': {
        'chapter_1_cover': json.dumps({
            'title': 'The Great Gatsby',
            'subtitle': 'A Reader\'s Journey',
            'author_note': 'A timeless classic',
        }),
        'chapter_2_journey': json.dumps({
            'timeline': [{'date': '2026-04-01', 'event': 'Started reading'}],
            'milestones': ['Reached page 100'],
        }),
    },
    'reading_plan': {
        'generate': (
            '7-Day Reading Plan for "Sapiens"\n\n'
            'Day 1: Pages 1-57\n  - Focus: Cognitive Revolution\n  - Question: What makes humans unique?\n\n'
            'Day 2: Pages 58-114\n  - Focus: Agricultural Revolution\n  - Question: Was farming a mistake?'
        ),
    },
    'conversation_memory': {
        'summarize': json.dumps({
            'key_topics': ['symbolism', 'green light', 'hopes and dreams'],
            'insights': ['The green light is a central symbol'],
            'unresolved_questions': ['What does the valley of ashes represent?'],
        }),
    },
}
