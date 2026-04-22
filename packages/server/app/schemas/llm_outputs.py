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
