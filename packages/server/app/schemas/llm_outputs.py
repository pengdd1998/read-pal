"""Pydantic schemas for validating LLM structured outputs.

Every service that expects structured JSON from the LLM must validate
against the appropriate schema here. This prevents silent data corruption
from malformed LLM responses.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Study mode
# ---------------------------------------------------------------------------

class StudyObjective(BaseModel):
    id: str = ''
    text: str
    completed: bool = False


class StudyObjectiveList(BaseModel):
    objectives: list[StudyObjective] = Field(default_factory=list, max_length=10)


class ConceptCheck(BaseModel):
    id: str = ''
    question: str
    hint: str = ''
    answer: str
    position: str = 'middle'


class ConceptCheckList(BaseModel):
    checks: list[ConceptCheck] = Field(default_factory=list, max_length=10)


# ---------------------------------------------------------------------------
# Knowledge graph
# ---------------------------------------------------------------------------

class ExtractedConcept(BaseModel):
    name: str
    type: str = 'concept'
    related: list[str] = Field(default_factory=list)
    description: str = ''


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
    timeline: list[TimelineEvent] = Field(default_factory=list)
    milestones: list[str] = Field(default_factory=list)


class HighlightEntry(BaseModel):
    passage: str = ''
    context: str = ''
    significance: str = ''


class HighlightsData(BaseModel):
    highlights: list[HighlightEntry] = Field(default_factory=list)
    themes: list[str] = Field(default_factory=list)


class NoteInsight(BaseModel):
    theme: str = ''
    insights: list[str] = Field(default_factory=list)
    connections: list[str] = Field(default_factory=list)


class NotesData(BaseModel):
    themes: list[NoteInsight] = Field(default_factory=list)


class ConversationMoment(BaseModel):
    topic: str = ''
    insight: str = ''
    exchange: str = ''


class ConversationsData(BaseModel):
    moments: list[ConversationMoment] = Field(default_factory=list)


class BookRecommendation(BaseModel):
    title: str = ''
    author: str = ''
    reason: str = ''


class LookingForwardData(BaseModel):
    recommendations: list[BookRecommendation] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Reading Mirror sections (v2)
# ---------------------------------------------------------------------------

class EncounterPrologue(BaseModel):
    text: str = ''
    reading_archetype: str = ''
    archetype_description: str = ''


class EncounterStats(BaseModel):
    total_reading_time: str = ''
    session_count: int = 0
    highlight_count: int = 0
    longest_session: str = ''


class EncounterData(BaseModel):
    prologue: EncounterPrologue = Field(default_factory=EncounterPrologue)
    stats: EncounterStats = Field(default_factory=EncounterStats)


class HighlightQuote(BaseModel):
    quote: str = ''
    page_location: str = ''
    why_it_mattered: str = ''


class HighlightCluster(BaseModel):
    name: str = ''
    description: str = ''
    highlights: list[HighlightQuote] = Field(default_factory=list)


class HighlightClusterData(BaseModel):
    clusters: list[HighlightCluster] = Field(default_factory=list)


class GroundedRecommendation(BaseModel):
    title: str = ''
    author: str = ''
    reason: str = ''
    connection_to_current: str = ''
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
    themes: list[ThemeEntry] = Field(default_factory=list)
    connections: list[ConnectionEntry] = Field(default_factory=list)
    timeline: list[dict] = Field(default_factory=list)
    insights: list[str] = Field(default_factory=list)


class CrossBookComparison(BaseModel):
    common_themes: list[ThemeEntry] = Field(default_factory=list)
    unique_perspectives: list[dict] = Field(default_factory=list)
    recommended_connections: list[str] = Field(default_factory=list)


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
    date: str = ''
    description: str = ''


class AttentionMapData(BaseModel):
    peaks: list[EngagementPeak] = Field(default_factory=list)
    pattern_analysis: str = ''
    engagement_score: int = Field(default=0, ge=0, le=10)
    reading_style: str = ''


class StuckConcept(BaseModel):
    concept: str = ''
    evidence: str = ''


class SlippingConcept(BaseModel):
    concept: str = ''
    tip: str = ''


class WhatStuckData(BaseModel):
    stuck: list[StuckConcept] = Field(default_factory=list)
    slipping: list[SlippingConcept] = Field(default_factory=list)
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
    hub_concepts: list[HubConcept] = Field(default_factory=list)
    surprising_connections: list[SurprisingConnection] = Field(default_factory=list)
    peripheral_concepts: list[str] = Field(default_factory=list)
    map_narrative: str = ''


class ThemeThread(BaseModel):
    theme: str = ''
    books: list[str] = Field(default_factory=list)
    connection: str = ''


class ThreadsData(BaseModel):
    threads: list[ThemeThread] = Field(default_factory=list)
    reading_pattern: str = ''
    suggested_next_theme: str = ''


class ReaderBecameData(BaseModel):
    essay: str = ''
    key_transformation: str = ''
    parting_question: str = ''


class AnnotationPhase(BaseModel):
    name: str = ''
    narrative: str = ''
    key_notes: list[str] = Field(default_factory=list)


class AnnotationsWovenData(BaseModel):
    phases: list[AnnotationPhase] = Field(default_factory=list)
    arc_summary: str = ''


class BreakthroughMoment(BaseModel):
    title: str = ''
    narrative: str = ''
    reader_question: str = ''
    insight: str = ''


class MirrorConversationsData(BaseModel):
    breakthroughs: list[BreakthroughMoment] = Field(default_factory=list)
    summary: str = ''
