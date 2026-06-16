"""P2.5: Test-set fixtures for prompt regression coverage.

Curated inputs covering normal, edge, and failure-prone cases for both
the companion system prompt and the Reading Mirror section prompts.
Imported by ``tests/test_p25_prompt_test_set.py`` and any future
prompt-quality eval harness.

Each entry exercises a code path the prompt-review skill flagged:
- normal: realistic mid-book reader
- edge: just-started, completed, missing fields
- failure-prone: very long fields, special characters, all personas/genres
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class BookFixture:
    """Minimal book stand-in for build_system_prompt tests."""
    title: str = 'The Lord of the Rings'
    author: str = 'J.R.R. Tolkien'
    progress: float = 50
    current_page: int = 250
    total_pages: int = 500
    current_segment: int = 5
    status: str = 'reading'


@dataclass
class PromptTestCase:
    """A single render-test case."""
    name: str
    book: BookFixture = field(default_factory=BookFixture)
    companion_mode: str = 'casual'
    persona: str | None = None
    genre: str | None = None
    context: dict[str, Any] | None = None
    annotations_ctx: str = ''
    rag_ctx: str = ''
    memory_summary: str = ''
    expected_substrings: tuple[str, ...] = ()
    unexpected_substrings: tuple[str, ...] = ()


# ---------------------------------------------------------------------------
# Companion system prompt — normal cases
# ---------------------------------------------------------------------------

COMPANION_CASES: list[PromptTestCase] = [
    PromptTestCase(
        name='normal_mid_book',
        expected_substrings=('The Lord of the Rings', 'J.R.R. Tolkien', 'page 250 of 500'),
    ),
    PromptTestCase(
        name='socratic_mode',
        companion_mode='socratic',
        expected_substrings=('SOCRATIC mode',),
    ),
    PromptTestCase(
        name='persona_sage',
        persona='sage',
        expected_substrings=('<persona>', 'Sage',),
    ),
    PromptTestCase(
        name='persona_penny',
        persona='penny',
        expected_substrings=('<persona>', 'Penny',),
    ),
    PromptTestCase(
        name='persona_alex',
        persona='alex',
        expected_substrings=('<persona>', 'Alex',),
    ),
    PromptTestCase(
        name='persona_quinn',
        persona='quinn',
        expected_substrings=('<persona>', 'Quinn',),
    ),
    PromptTestCase(
        name='persona_sam',
        persona='sam',
        expected_substrings=('<persona>', 'Sam',),
    ),
    PromptTestCase(
        name='genre_fiction',
        genre='fiction',
        expected_substrings=('GENRE CONTEXT', 'fiction',),
    ),
    PromptTestCase(
        name='genre_nonfiction',
        genre='nonfiction',
        expected_substrings=('GENRE CONTEXT', 'non-fiction',),
    ),
    PromptTestCase(
        name='genre_technical',
        genre='technical',
        expected_substrings=('GENRE CONTEXT', 'technical',),
    ),
    PromptTestCase(
        name='genre_academic',
        genre='academic',
        expected_substrings=('GENRE CONTEXT', 'academic',),
    ),
    PromptTestCase(
        name='genre_poetry',
        genre='poetry',
        expected_substrings=('GENRE CONTEXT', 'poetry',),
    ),
    PromptTestCase(
        name='genre_biography',
        genre='biography',
        expected_substrings=('GENRE CONTEXT', 'biography',),
    ),
    PromptTestCase(
        name='genre_history',
        genre='history',
        expected_substrings=('GENRE CONTEXT', 'history',),
    ),
    PromptTestCase(
        name='genre_philosophy',
        genre='philosophy',
        expected_substrings=('GENRE CONTEXT', 'philosophy',),
    ),
    PromptTestCase(
        name='with_annotations',
        annotations_ctx='User highlighted: "One does not simply walk into Mordor."',
        expected_substrings=('annotations',),
    ),
    PromptTestCase(
        name='with_rag',
        rag_ctx='Frodo hesitated at the Crack of Doom.',
        expected_substrings=('Relevant passages',),
    ),
    PromptTestCase(
        name='with_memory',
        memory_summary='Reader previously discussed the ring\'s corrupting influence.',
        expected_substrings=('Summary of previous conversation',),
    ),
    PromptTestCase(
        name='with_chapter_content',
        context={'chapterContent': 'The ring whispered to him in the dark.'},
        expected_substrings=('Current chapter content',),
    ),
]

# ---------------------------------------------------------------------------
# Companion system prompt — edge cases
# ---------------------------------------------------------------------------

COMPANION_EDGE_CASES: list[PromptTestCase] = [
    PromptTestCase(
        name='just_started_page_zero',
        book=BookFixture(progress=0, current_page=0, total_pages=500, status='unread'),
        expected_substrings=('just begun', 'early stage'),
        unexpected_substrings=('page 0 of 500', 'CRITICAL SPOILER PREVENTION'),
    ),
    PromptTestCase(
        name='unknown_total_pages',
        book=BookFixture(progress=0, current_page=0, total_pages=0, status='unread'),
        expected_substrings=('just begun', 'early stage'),
        unexpected_substrings=('page 0 of 0',),
    ),
    PromptTestCase(
        name='book_completed',
        book=BookFixture(progress=100, current_page=500, total_pages=500, status='completed'),
        expected_substrings=('finished this book',),
        unexpected_substrings=('CRITICAL SPOILER PREVENTION',),
    ),
    PromptTestCase(
        name='book_completed_via_pages_only',
        # Page-level signal without status flip
        book=BookFixture(progress=99, current_page=500, total_pages=500, status='reading'),
        expected_substrings=('finished this book',),
        unexpected_substrings=('CRITICAL SPOILER PREVENTION',),
    ),
    PromptTestCase(
        name='special_characters_in_title',
        book=BookFixture(title='"Quotes" & <html>', author='Name with é characters'),
        # The sanitizer should strip/escape these; verify no crash.
        expected_substrings=(),
    ),
    PromptTestCase(
        name='very_long_annotations',
        annotations_ctx='x' * 10_000,
        # Budget should truncate without overflow
        expected_substrings=(),
    ),
]

# ---------------------------------------------------------------------------
# Reading Mirror section prompt fixtures — verifies each section renders
# with realistic enriched_data and contains its expected JSON scaffolding.
# ---------------------------------------------------------------------------

MIRROR_FIXTURE_DATA: dict[str, dict[str, Any]] = {
    'encounter': {
        'total_time': '5 hours', 'session_count': 12,
        'first_date': 'Jan 1', 'last_date': 'Jan 15',
        'first_highlight': 'A memorable passage', 'concept_list': 'love, war',
        'mastery_score': 75,
    },
    'highlights': {
        'count': 25, 'book_title': 'Test Book',
        'concept_list': 'concept1, concept2', 'theme_list': 'theme1, theme2',
    },
    'recommendations': {
        'book_title': 'Test Book', 'top_themes': 'love, loss',
        'concept_list': 'concept1', 'existing_books': 'Book A, Book B',
    },
    'conversations': {
        'chat_count': 15, 'book_title': 'Test Book',
        'chat_excerpts': 'reader asked about X, AI explained Y',
    },
    'annotations_woven': {
        'note_count': 10, 'book_title': 'Test Book',
        'notes_data': 'note1, note2, note3',
    },
    'attention_map': {
        'session_count': 12, 'book_title': 'Test Book', 'reading_days': 8,
        'total_time': '5 hours', 'session_data': 'data here',
        'pace': 25, 'longest_session': '45 minutes',
    },
    'what_stuck': {
        'flashcard_count': 20, 'book_title': 'Test Book',
        'flashcard_data': 'card1, card2', 'mastery_score': 80,
        'strong_areas': 'concepts A', 'weak_areas': 'concepts B',
    },
    'concept_web': {
        'book_title': 'Test Book', 'concept_count': 15,
        'concept_list': 'concept1', 'edge_descriptions': 'edge1',
        'theme_list': 'theme1',
    },
    'threads': {
        'book_title': 'Test Book', 'theme_list': 'theme1',
        'concept_list': 'concept1', 'other_books': 'Book A, Book B',
    },
    'reader_became': {
        'book_title': 'Test Book', 'book_author': 'Test Author',
        'total_time': '5 hours', 'session_count': 12,
        'highlight_count': 25, 'note_count': 10,
        'concept_list': 'concept1', 'theme_list': 'theme1',
        'mastery_score': 80,
    },
}
