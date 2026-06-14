"""Study mode and knowledge extraction prompt templates."""

from __future__ import annotations

from app.prompts.base import PromptTemplate

# ---------------------------------------------------------------------------
# Flashcard generation
# ---------------------------------------------------------------------------

FLASHCARD_GENERATION_SYSTEM = PromptTemplate(
    key='flashcard.generation.system',
    version=2,
    template=(
        'You are a study assistant. Generate flashcard Q&A pairs from the reading highlights below. '
        'Return a JSON OBJECT with a "cards" field containing an array of {{"question", "answer"}} objects. '
        'Generate exactly {count} cards. Questions should test understanding, not just recall. '
        'Answers should be concise (1-3 sentences). Output ONLY the JSON object.'
    ),
    variables=['count'],
    output_format='json',
)

FLASHCARD_GENERATION_HUMAN = PromptTemplate(
    key='flashcard.generation.human',
    version=1,
    template=(
        'Book: "{title}" by {author}\n\n'
        'Highlights and notes:\n{annotation_text}'
    ),
    variables=['title', 'author', 'annotation_text'],
    output_format='text',
)

# ---------------------------------------------------------------------------
# Study objectives
# ---------------------------------------------------------------------------

STUDY_OBJECTIVES_SYSTEM = PromptTemplate(
    key='study.objectives.system',
    version=1,
    template=(
        'You are a study assistant. Generate 3-5 concise learning objectives '
        'for the given chapter. Return ONLY a JSON array of objects with '
        '"id" (uuid string), "text" (the objective), and "completed" (false). '
        'Example: [{{"id":"...","text":"...","completed":false}}]'
    ),
    output_format='json_array',
)

STUDY_OBJECTIVES_HUMAN = PromptTemplate(
    key='study.objectives.human',
    version=1,
    template='Generate learning objectives for chapter {chapter_index}: "{chapter_title}"',
    variables=['chapter_index', 'chapter_title'],
    output_format='text',
)

# ---------------------------------------------------------------------------
# Concept checks
# ---------------------------------------------------------------------------

STUDY_CONCEPT_CHECKS_SYSTEM = PromptTemplate(
    key='study.concept_checks.system',
    version=1,
    template=(
        'You are a study assistant. Generate 3-5 concept check questions for '
        'the given chapter. Return ONLY a JSON array of objects, each with: '
        '"id" (uuid string), "question", "hint", "answer", and "position" '
        '(one of "start", "middle", "end"). '
        'Example: [{{"id":"...","question":"...","hint":"...","answer":"...","position":"start"}}]'
    ),
    output_format='json_array',
)

STUDY_CONCEPT_CHECKS_HUMAN = PromptTemplate(
    key='study.concept_checks.human',
    version=1,
    template=(
        'Generate concept check questions for chapter {chapter_index}: '
        '"{chapter_title}"{content_hint}'
    ),
    variables=['chapter_index', 'chapter_title', 'content_hint'],
    output_format='text',
)

# ---------------------------------------------------------------------------
# Knowledge graph
# ---------------------------------------------------------------------------

KNOWLEDGE_EXTRACTION_SYSTEM = PromptTemplate(
    key='knowledge.extraction.system',
    version=2,
    template=(
        'You are a knowledge extraction assistant. Analyze reader annotations '
        'and extract key concepts as structured data. Return ONLY a JSON object '
        'with a "concepts" array. Each concept should have: '
        '"name" (string), "type" (one of: concept, character, theme, location), '
        '"related" (array of related concept names), '
        '"relationships" (array of objects, each with "target" (concept name) and '
        '"label" describing the relationship type such as "causes", "contrasts with", '
        '"is a subtype of", "builds upon", "exemplifies", "opposes", "is analogous to", '
        '"depends on", or another precise verb phrase). '
        '"description" (brief explanation). '
        'Example: {{"concepts":[{{"name":"Resilience","type":"theme",'
        '"related":["Hope"],'
        '"relationships":[{{"target":"Hope","label":"sustains"}}],'
        '"description":"The ability to recover from adversity"}}]}}'
    ),
    output_format='json',
)

KNOWLEDGE_EXTRACTION_HUMAN = PromptTemplate(
    key='knowledge.extraction.human',
    version=1,
    template='Analyze these reader annotations and extract concepts:\n\n{annotations}',
    variables=['annotations'],
    output_format='text',
)
