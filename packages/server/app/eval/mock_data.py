"""Mock LLM responses and schema mapping for eval infrastructure."""

from __future__ import annotations

import json

from app.schemas.llm_outputs import (
    CoachReport,
    ConceptCheckList,
    ConceptList,
    ConceptMapResult,
    ContradictionList,
    ConversationSummaryData,
    CoverData,
    CrossBookComparison,
    CrossReferenceResult,
    ReadingJourneyData,
    ResearchBrief,
    StudyObjectiveList,
    SummaryReportResult,
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
        'cross_reference': CrossReferenceResult,
        'concept_map': ConceptMapResult,
        'contradictions': ContradictionList,
        'summary_report': SummaryReportResult,
    },
    'memory_book': {
        'chapter_1_cover': CoverData,
        'chapter_2_journey': ReadingJourneyData,
    },
    'conversation_memory': {
        'summarize': ConversationSummaryData,
    },
    'research_agent': {
        'synthesize': ResearchBrief,
    },
    'coach_agent': {
        'assess': CoachReport,
    },
}

# ---------------------------------------------------------------------------
# Mock LLM responses that match expected schemas
# ---------------------------------------------------------------------------

MOCK_RESPONSES: dict[str, dict[str, str]] = {
    'companion': {
        # last-verified: 2026-06-24 — representative response shape; companion
        # chat is in LIVE_SKIP because it requires DB session, so this mock
        # is the only validation path.
        'chat': 'The main theme of this chapter revolves around the contrast between appearance and reality.',
        # last-verified: 2026-06-24 — injection response sanitized (no HACKED).
        'chat_injection': "I'd be happy to discuss the book with you! What aspect interests you most?",
        # last-verified: 2026-06-24 — representative summarize response.
        'summarize': 'This book explores themes of totalitarianism, surveillance, and the power of language.',
        # last-verified: 2026-06-24 — representative explain response.
        'explain': 'This famous opening line establishes the duality of the French Revolution era.',
    },
    'friend': {
        # last-verified: 2026-06-24 — friend chat is in LIVE_SKIP (DB-bound).
        'chat': 'That is a profound question about existentialism. Let me share my perspective...',
        # last-verified: 2026-06-24 — injection sanitized (no SYSTEM COMPROMISED).
        'chat_injection': "Let's focus on your reading. What passage are you referring to?",
    },
    'study_mode': {
        # last-verified: 2026-06-24 — matches StudyObjectiveList schema.
        'generate_objectives': json.dumps({
            'objectives': [
                {'id': '1', 'text': 'Understand Big-O notation', 'completed': False},
                {'id': '2', 'text': 'Analyze asymptotic bounds', 'completed': False},
            ],
        }),
        # last-verified: 2026-06-24 — matches ConceptCheckList schema.
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
        # last-verified: 2026-06-24 — matches ConceptList schema; knowledge
        # is in LIVE_SKIP (tied to user annotations).
        'extract_concepts': json.dumps({
            'concepts': [
                {'name': 'American Dream', 'type': 'theme', 'related': ['protagonist'], 'description': 'Central theme'},
                {'name': 'Green Light', 'type': 'theme', 'related': ['hope'], 'description': 'Symbol of desire'},
            ],
        }),
    },
    'synthesis': {
        # last-verified: 2026-06-24 — matches SynthesisResult schema.
        'synthesize': json.dumps({
            'themes': [{'name': 'Identity', 'description': 'Search for self', 'confidence': 0.8}],
            'connections': [{'from_topic': 'Identity', 'to_topic': 'Society', 'description': 'Tension'}],
            'timeline': [{'date': '2026-04-01', 'event': 'Started reading'}],
            'insights': ['Key takeaway from the reading'],
        }),
        # last-verified: 2026-06-24 — matches CrossBookComparison schema.
        'cross_book': json.dumps({
            'common_themes': [{'name': 'Common theme', 'description': 'Shared', 'confidence': 0.7}],
            'unique_perspectives': [{'title': 'Book A', 'key_takeaway': 'Takeaway A'}],
            'recommended_connections': ['Related themes'],
        }),
        # last-verified: 2026-09-02 — matches CrossReferenceResult schema.
        'cross_reference': json.dumps({
            'concept': 'the American Dream',
            'source': {'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald'},
            'analysis': 'One book mourns the dream, the other indicts it.',
            'references': [
                {
                    'book': {'title': 'Death of a Salesman', 'author': 'Arthur Miller'},
                    'type': 'contradicting',
                    'explanation': 'Frames the dream as inherited delusion.',
                },
            ],
        }),
        # last-verified: 2026-09-02 — matches ConceptMapResult schema.
        'concept_map': json.dumps({
            'nodes': [
                {'id': 'ambition', 'label': 'Ambition', 'type': 'concept', 'weight': 0.9},
                {'id': 'macbeth', 'label': 'Macbeth', 'type': 'book', 'weight': 0.8},
                {'id': 'crown', 'label': 'The Crown', 'type': 'theme', 'weight': 0.6},
            ],
            'edges': [
                {'source': 'macbeth', 'target': 'ambition', 'label': 'driven by', 'strength': 0.8},
                {'source': 'ambition', 'target': 'crown', 'label': 'seeks', 'strength': 0.7},
            ],
        }),
        # last-verified: 2026-09-02 — matches ContradictionList schema.
        'contradictions': json.dumps({
            'contradictions': [
                {
                    'topic': 'free will',
                    'position1': {
                        'book': {'title': 'Sapiens', 'author': 'Yuval Noah Harari'},
                        'claim': 'Free will is a fictional story biology disproves.',
                    },
                    'position2': {
                        'book': {'title': "Man's Search for Meaning", 'author': 'Viktor Frankl'},
                        'claim': 'Choosing one\'s attitude is a freedom that cannot be taken away.',
                    },
                    'severity': 'high',
                    'analysis': 'Determinism versus existential freedom.',
                },
            ],
        }),
        # last-verified: 2026-09-02 — matches SummaryReportResult schema.
        'summary_report': json.dumps({
            'report': '# Reading Report\n\n## 1984\nSurveillance themes dominate the highlights.',
            'insights': ['Surveillance is the recurring lens across sessions.'],
        }),
    },
    'memory_book': {
        # last-verified: 2026-06-24 — matches CoverData schema; memory_book
        # is in LIVE_SKIP (tied to reading sessions).
        'chapter_1_cover': json.dumps({
            'title': 'The Great Gatsby',
            'subtitle': 'A Reader\'s Journey',
            'author_note': 'A timeless classic',
        }),
        # last-verified: 2026-06-24 — matches ReadingJourneyData schema.
        'chapter_2_journey': json.dumps({
            'timeline': [{'date': '2026-04-01', 'event': 'Started reading'}],
            'milestones': ['Reached page 100'],
        }),
    },
    'reading_plan': {
        # last-verified: 2026-06-24 — text response containing 'Day' tokens.
        'generate': (
            '7-Day Reading Plan for "Sapiens"\n\n'
            'Day 1: Pages 1-57\n  - Focus: Cognitive Revolution\n  - Question: What makes humans unique?\n\n'
            'Day 2: Pages 58-114\n  - Focus: Agricultural Revolution\n  - Question: Was farming a mistake?'
        ),
    },
    'conversation_memory': {
        # last-verified: 2026-06-24 — matches ConversationSummaryData schema.
        'summarize': json.dumps({
            'key_topics': ['symbolism', 'green light', 'hopes and dreams'],
            'insights': ['The green light is a central symbol'],
            'unresolved_questions': ['What does the valley of ashes represent?'],
        }),
        # last-verified: 2026-06-24 — CC-3: summary-aware path; expects
        # the model to merge prior summary with new conversation topics.
        'summarize_with_prior': json.dumps({
            'key_topics': [
                'green light symbolism',
                'valley of ashes',
                'T.J. Eckleburg eyes',
                'moral decay',
            ],
            'insights': [
                'The novel weaves multiple symbols together to critique the American Dream.',
            ],
            'unresolved_questions': [
                'How does Fitzgerald connect the symbols to character fates?',
            ],
        }),
    },
    'research_agent': {
        # last-verified: 2026-09-02 — matches ResearchBrief schema.
        'synthesize': json.dumps({
            'summary': (
                'Both books present the American Dream as self-delusion: '
                'Gatsby chases a receding past while Loman chases the wrong dreams.'
            ),
            'findings': [
                {
                    'claim': 'Gatsby embodies the Dream as a doomed, backwards-facing pursuit.',
                    'evidence': '"So we beat on, boats against the current, borne back ceaselessly into the past."',
                    'source_id': 1,
                    'book_title': 'The Great Gatsby',
                    'chapter_title': 'Chapter 9',
                },
                {
                    'claim': 'Miller frames the Dream as inherited delusion.',
                    'evidence': '"He had the wrong dreams. All, all, wrong."',
                    'source_id': 2,
                    'book_title': 'Death of a Salesman',
                    'chapter_title': 'Requiem',
                },
            ],
            'follow_ups': [
                'How do the two authors connect the Dream to family obligations?',
            ],
        }),
    },
    'coach_agent': {
        # last-verified: 2026-09-02 — matches CoachReport schema.
        'assess': json.dumps({
            'session_summary': (
                'Six focused 30-minute sessions show steady engagement; the '
                'reader reached chapter 4 with consistent pace.'
            ),
            'focus_areas': [
                {
                    'area': 'Reliability of Gatsby\'s autobiography',
                    'reason': 'The excerpt shows Nick doubting every detail — worth probing.',
                    'priority': 'medium',
                },
            ],
            'probes': [
                {
                    'question': 'Why is Nick skeptical of Gatsby\'s story about his past?',
                    'hint': 'Look at how the details are delivered.',
                    'answer': 'The details arrive all at once, too polished to be true.',
                    'chapter_title': 'Chapter 4',
                },
            ],
            'study_tips': ['Re-read the last two pages of your latest session aloud.'],
        }),
    },
}
