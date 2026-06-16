"""Tests for hardened LLM output schemas (P1.7 from prompt-robustness plan).

Covers:
- Literal enum types (concept type, concept-check position)
- min_length on required string fields
- max_length caps to catch runaway LLM output
- Empty-default construction for wrapper schemas used as fallbacks
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.llm_outputs import (
    AttentionMapData,
    ConceptCheck,
    ConceptCheckList,
    ConceptList,
    ConceptRelation,
    ConversationSummaryData,
    CrossBookComparison,
    EncounterData,
    EncounterPrologue,
    ExtractedConcept,
    FlashcardList,
    GroundedRecommendationData,
    HighlightClusterData,
    MirrorConversationsData,
    ReaderBecameData,
    StudyObjective,
    StudyObjectiveList,
    SynthesisResult,
    ThreadsData,
    WhatStuckData,
)


# ---------------------------------------------------------------------------
# Wrapper schemas construct with empty defaults (fallback path)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    'cls',
    [
        FlashcardList, StudyObjectiveList, ConceptCheckList, ConceptList,
        CrossBookComparison, ConversationSummaryData, SynthesisResult,
        EncounterData, HighlightClusterData, GroundedRecommendationData,
        AttentionMapData, WhatStuckData,
        ThreadsData, ReaderBecameData, MirrorConversationsData,
    ],
)
def test_wrapper_schema_constructs_empty(cls) -> None:
    """Every wrapper schema must construct with no args (fallback path)."""
    cls()  # must not raise


# ---------------------------------------------------------------------------
# Literal enums
# ---------------------------------------------------------------------------


@pytest.mark.parametrize('position', ['start', 'middle', 'end'])
def test_concept_check_position_accepts_valid(position: str) -> None:
    ConceptCheck(question='q', answer='a', position=position)


def test_concept_check_position_rejects_invalid() -> None:
    with pytest.raises(ValidationError):
        ConceptCheck(question='q', answer='a', position='invalid')


@pytest.mark.parametrize(
    'kind',
    ['concept', 'character', 'theme', 'location', 'other'],
)
def test_extracted_concept_type_accepts_valid(kind: str) -> None:
    ExtractedConcept(name='X', type=kind)


@pytest.mark.parametrize('kind', ['entity', 'person', 'event', 'symbol', ''])
def test_extracted_concept_type_rejects_invalid(kind: str) -> None:
    with pytest.raises(ValidationError):
        ExtractedConcept(name='X', type=kind)


# ---------------------------------------------------------------------------
# min_length on required fields
# ---------------------------------------------------------------------------


def test_study_objective_rejects_empty_text() -> None:
    with pytest.raises(ValidationError):
        StudyObjective(text='')


def test_concept_check_rejects_empty_question() -> None:
    with pytest.raises(ValidationError):
        ConceptCheck(question='', answer='a')


def test_concept_check_rejects_empty_answer() -> None:
    with pytest.raises(ValidationError):
        ConceptCheck(question='q', answer='')


def test_extracted_concept_rejects_empty_name() -> None:
    with pytest.raises(ValidationError):
        ExtractedConcept(name='')


def test_concept_relation_rejects_empty_target() -> None:
    with pytest.raises(ValidationError):
        ConceptRelation(target='')


# ---------------------------------------------------------------------------
# max_length caps (runaway output defense)
# ---------------------------------------------------------------------------


def test_reader_became_essay_rejects_overlong() -> None:
    with pytest.raises(ValidationError):
        ReaderBecameData(essay='x' * 4001)


def test_encounter_prologue_text_rejects_overlong() -> None:
    with pytest.raises(ValidationError):
        EncounterPrologue(text='x' * 3001)


def test_attention_map_pattern_analysis_rejects_overlong() -> None:
    with pytest.raises(ValidationError):
        AttentionMapData(pattern_analysis='x' * 2001)


def test_mirror_conversations_summary_rejects_overlong() -> None:
    with pytest.raises(ValidationError):
        MirrorConversationsData(summary='x' * 2001)


def test_threads_reading_pattern_accepts_reasonable() -> None:
    """Sanity: confirm the schema accepts reasonable input."""
    ThreadsData(reading_pattern='a' * 200)


# ---------------------------------------------------------------------------
# Numeric range (existing behavior preserved)
# ---------------------------------------------------------------------------


def test_engagement_score_rejects_out_of_range() -> None:
    with pytest.raises(ValidationError):
        AttentionMapData(engagement_score=11)
    with pytest.raises(ValidationError):
        AttentionMapData(engagement_score=-1)


def test_engagement_score_accepts_bounds() -> None:
    AttentionMapData(engagement_score=0)
    AttentionMapData(engagement_score=10)


# ---------------------------------------------------------------------------
# max_length caps on lists (runaway LLM output defense)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    'cls,field,cap',
    [
        # Synthesis schemas
        ('SynthesisResult', 'themes', 20),
        ('SynthesisResult', 'connections', 30),
        ('SynthesisResult', 'timeline', 50),
        ('SynthesisResult', 'insights', 20),
        # Cross-book schemas
        ('CrossBookComparison', 'common_themes', 20),
        ('CrossBookComparison', 'unique_perspectives', 20),
        ('CrossBookComparison', 'recommended_connections', 20),
        # Memory book schemas
        ('ThreadsData', 'threads', 10),
        ('WhatStuckData', 'stuck', 20),
        ('WhatStuckData', 'slipping', 20),
    ],
)
def test_list_field_rejects_overlong(cls: str, field: str, cap: int) -> None:
    """Lists bounded by max_length reject over-long input.

    Without these caps, an LLM that hallucinates 100 themes / connections /
    threads would force downstream renderers to process them all. Caps give
    us a hard ceiling regardless of what the model emits.
    """
    import app.schemas.llm_outputs as mod
    schema_cls = getattr(mod, cls)
    payload = {field: [{}] * (cap + 1)}
    with pytest.raises(ValidationError):
        schema_cls(**payload)
