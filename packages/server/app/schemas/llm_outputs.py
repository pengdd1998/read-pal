"""Pydantic schemas for validating LLM structured outputs.

Every service that expects structured JSON from the LLM must validate
against the appropriate schema here. This prevents silent data corruption
from malformed LLM responses.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Flashcards
# ---------------------------------------------------------------------------

class FlashcardItem(BaseModel):
    """A single generated flashcard.

    Fields are intentionally lenient (no min/max length): the LLM may emit
    empty or over-long values, and ``_create_cards`` filters empties and
    truncates to the DB column limits. A strict schema here would reject the
    whole batch on one bad card.
    """

    question: str = ''
    answer: str = ''


class FlashcardList(BaseModel):
    """Wrapper for the LLM's flashcard output."""

    cards: list[FlashcardItem] = Field(default_factory=list, max_length=20)


# ---------------------------------------------------------------------------
# Study mode
# ---------------------------------------------------------------------------

class StudyObjective(BaseModel):
    id: str = ''
    text: str = Field(..., min_length=1, max_length=500)
    completed: bool = False


class StudyObjectiveList(BaseModel):
    objectives: list[StudyObjective] = Field(default_factory=list, max_length=10)


class ConceptCheck(BaseModel):
    id: str = ''
    question: str = Field(..., min_length=1, max_length=1000)
    hint: str = Field('', max_length=500)
    answer: str = Field(..., min_length=1, max_length=2000)
    position: Literal['start', 'middle', 'end'] = 'middle'


class ConceptCheckList(BaseModel):
    checks: list[ConceptCheck] = Field(default_factory=list, max_length=10)


# ---------------------------------------------------------------------------
# Knowledge graph
# ---------------------------------------------------------------------------

class ConceptRelation(BaseModel):
    """A typed relationship from this concept to another."""

    target: str = Field(..., min_length=1, max_length=200)
    label: str = Field('related', max_length=200)


class ExtractedConcept(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    # 'other' is allowed as a safety hatch so an unexpected type doesn't
    # invalidate the whole batch — GraphNode.type downstream also accepts 'other'.
    type: Literal['concept', 'character', 'theme', 'location', 'other'] = 'concept'
    related: list[str] = Field(default_factory=list, max_length=30)
    relationships: list[ConceptRelation] = Field(default_factory=list, max_length=30)
    description: str = Field('', max_length=1000)


class ConceptList(BaseModel):
    concepts: list[ExtractedConcept] = Field(default_factory=list, max_length=50)


# ---------------------------------------------------------------------------
# Memory book chapters
# ---------------------------------------------------------------------------

class CoverData(BaseModel):
    title: str = ''
    subtitle: str = ''
    author_note: str = ''


class TimelineEvent(BaseModel):
    date: str = ''
    event: str = ''


class ReadingJourneyData(BaseModel):
    timeline: list[TimelineEvent] = Field(default_factory=list, max_length=50)
    milestones: list[str] = Field(default_factory=list, max_length=30)


class HighlightEntry(BaseModel):
    passage: str = ''
    context: str = ''
    significance: str = ''


class HighlightsData(BaseModel):
    highlights: list[HighlightEntry] = Field(default_factory=list, max_length=30)
    themes: list[str] = Field(default_factory=list, max_length=20)


class NoteInsight(BaseModel):
    theme: str = ''
    insights: list[str] = Field(default_factory=list, max_length=20)
    connections: list[str] = Field(default_factory=list, max_length=20)


class NotesData(BaseModel):
    themes: list[NoteInsight] = Field(default_factory=list, max_length=20)


class ConversationMoment(BaseModel):
    topic: str = ''
    insight: str = ''
    exchange: str = ''


class ConversationsData(BaseModel):
    moments: list[ConversationMoment] = Field(default_factory=list, max_length=20)


class BookRecommendation(BaseModel):
    title: str = ''
    author: str = ''
    reason: str = ''


class LookingForwardData(BaseModel):
    recommendations: list[BookRecommendation] = Field(default_factory=list, max_length=10)
    next_steps: list[str] = Field(default_factory=list, max_length=10)


# ---------------------------------------------------------------------------
# Mood scene
# ---------------------------------------------------------------------------

class MoodSceneData(BaseModel):
    """Validated output from mood-based scene generation LLM."""
    scene: str = Field('', max_length=2000)
    suggestion: str = Field('', max_length=500)
    color: str = Field('', max_length=32)


# ---------------------------------------------------------------------------
# Reading Mirror sections (v2)
# ---------------------------------------------------------------------------

class EncounterPrologue(BaseModel):
    text: str = Field('', max_length=3000)
    reading_archetype: str = Field('', max_length=200)
    archetype_description: str = Field('', max_length=500)


class EncounterStats(BaseModel):
    total_reading_time: str = ''
    session_count: int = 0
    highlight_count: int = 0
    longest_session: str = ''


class EncounterData(BaseModel):
    prologue: EncounterPrologue = Field(default_factory=EncounterPrologue)
    stats: EncounterStats = Field(default_factory=EncounterStats)


class HighlightQuote(BaseModel):
    quote: str = Field('', max_length=1500)
    page_location: str = Field('', max_length=100)
    why_it_mattered: str = Field('', max_length=1000)


class HighlightCluster(BaseModel):
    name: str = Field('', max_length=200)
    description: str = Field('', max_length=2000)
    highlights: list[HighlightQuote] = Field(default_factory=list, max_length=20)


class HighlightClusterData(BaseModel):
    clusters: list[HighlightCluster] = Field(default_factory=list, max_length=10)


class GroundedRecommendation(BaseModel):
    title: str = Field('', max_length=300)
    author: str = Field('', max_length=200)
    reason: str = Field('', max_length=1500)
    connection_to_current: str = Field('', max_length=1500)
    urgency: str = Field('soon', pattern=r'^(now|soon|someday)$')


class GroundedRecommendationData(BaseModel):
    recommendations: list[GroundedRecommendation] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

class ThemeEntry(BaseModel):
    name: str = ''
    description: str = ''
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class ConnectionEntry(BaseModel):
    from_topic: str = ''
    to_topic: str = ''
    description: str = ''


class SynthesisResult(BaseModel):
    themes: list[ThemeEntry] = Field(default_factory=list, max_length=20)
    connections: list[ConnectionEntry] = Field(default_factory=list, max_length=30)
    timeline: list[dict] = Field(default_factory=list, max_length=50)
    insights: list[str] = Field(default_factory=list, max_length=20)


class CrossBookComparison(BaseModel):
    common_themes: list[ThemeEntry] = Field(default_factory=list, max_length=20)
    unique_perspectives: list[dict] = Field(default_factory=list, max_length=20)
    recommended_connections: list[str] = Field(default_factory=list, max_length=20)


# ---------------------------------------------------------------------------
# Conversation memory
# ---------------------------------------------------------------------------

class ConversationSummaryData(BaseModel):
    key_topics: list[str] = Field(default_factory=list, max_length=10)
    insights: list[str] = Field(default_factory=list, max_length=10)
    unresolved_questions: list[str] = Field(default_factory=list, max_length=5)


# ---------------------------------------------------------------------------
# Reading Mirror section-specific schemas (v2 Phase 2 sections)
# ---------------------------------------------------------------------------

class EngagementPeak(BaseModel):
    date: str = Field('', max_length=100)
    description: str = Field('', max_length=1000)


class AttentionMapData(BaseModel):
    peaks: list[EngagementPeak] = Field(default_factory=list, max_length=20)
    pattern_analysis: str = Field('', max_length=2000)
    engagement_score: int = Field(default=0, ge=0, le=10)
    reading_style: str = Field('', max_length=200)


class StuckConcept(BaseModel):
    concept: str = ''
    evidence: str = ''


class SlippingConcept(BaseModel):
    concept: str = ''
    tip: str = ''


class WhatStuckData(BaseModel):
    stuck: list[StuckConcept] = Field(default_factory=list, max_length=20)
    slipping: list[SlippingConcept] = Field(default_factory=list, max_length=20)
    retention_summary: str = ''
    top_insight: str = ''


class HubConcept(BaseModel):
    name: str = ''
    why_central: str = ''


class SurprisingConnection(BaseModel):
    from_name: str = Field('', alias='from')
    to_name: str = Field('', alias='to')
    insight: str = ''

    model_config = {'populate_by_name': True}


class ConceptWebData(BaseModel):
    hub_concepts: list[HubConcept] = Field(default_factory=list, max_length=20)
    surprising_connections: list[SurprisingConnection] = Field(default_factory=list, max_length=20)
    peripheral_concepts: list[str] = Field(default_factory=list, max_length=50)
    map_narrative: str = ''


class ThemeThread(BaseModel):
    theme: str = ''
    books: list[str] = Field(default_factory=list, max_length=20)
    connection: str = ''


class ThreadsData(BaseModel):
    threads: list[ThemeThread] = Field(default_factory=list, max_length=10)
    reading_pattern: str = ''
    suggested_next_theme: str = ''


class ReaderBecameData(BaseModel):
    essay: str = Field('', max_length=4000)
    key_transformation: str = Field('', max_length=500)
    parting_question: str = Field('', max_length=500)


class AnnotationPhase(BaseModel):
    name: str = Field('', max_length=200)
    narrative: str = Field('', max_length=3000)
    key_notes: list[str] = Field(default_factory=list, max_length=20)


class AnnotationsWovenData(BaseModel):
    phases: list[AnnotationPhase] = Field(default_factory=list, max_length=10)
    arc_summary: str = Field('', max_length=1000)


class BreakthroughMoment(BaseModel):
    title: str = Field('', max_length=300)
    narrative: str = Field('', max_length=3000)
    reader_question: str = Field('', max_length=1000)
    insight: str = Field('', max_length=1500)


class MirrorConversationsData(BaseModel):
    breakthroughs: list[BreakthroughMoment] = Field(default_factory=list, max_length=10)
    summary: str = Field('', max_length=2000)


# ---------------------------------------------------------------------------
# Research agent (Phase 2 multi-agent)
# ---------------------------------------------------------------------------

class ResearchFinding(BaseModel):
    claim: str = Field('', max_length=500)
    evidence: str = Field('', max_length=1500)
    source_id: int = Field(0, ge=0, le=50)
    book_title: str = Field('', max_length=300)
    chapter_title: str = Field('', max_length=300)


class ResearchBrief(BaseModel):
    summary: str = Field('', max_length=2000)
    findings: list[ResearchFinding] = Field(default_factory=list, max_length=10)
    follow_ups: list[str] = Field(default_factory=list, max_length=5)
