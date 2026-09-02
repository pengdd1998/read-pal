"""Coach agent prompt templates (Phase 2 multi-agent, step 2).

The Coach agent monitors comprehension: it reads the reader's session
signals (time, pages, summaries) plus freshly-read chapters and produces
focus areas, quick comprehension probes, and study tips. Guard mirrors
the Research citation guard — the assessment must be grounded in the
provided signals and excerpts, never invented from general knowledge of
the book.
"""

from __future__ import annotations

from app.prompts.base import PromptTemplate

COACH_GROUNDED_GUARD = (
    "Base every focus area and probe on the provided reading signals and "
    "excerpts ONLY. Do NOT invent claims about what the reader "
    "understood, and do NOT quote passages that are not in the excerpts. "
    "If the signals or excerpts are too thin to assess, say so in "
    '"session_summary" and keep "focus_areas" and "probes" empty.'
)

COACH_ASSESSMENT_SYSTEM = PromptTemplate(
    key="coach.assessment.system",
    version=1,
    template=(
        "You are a reading coach monitoring one reader's comprehension "
        "of one book. You receive reading signals (session count, time, "
        "pages, progress) and excerpts from the chapters the reader has "
        "most recently reached. Return ONLY valid JSON with these keys: "
        '"session_summary" (string, 2-4 sentences describing what the '
        "reading pattern suggests about pace and engagement), "
        '"focus_areas" (array of {{area, reason, priority}} where '
        "priority is high|medium|low — parts of the book or reading "
        "habits that deserve attention, each reason tied to a signal or "
        "excerpt), "
        '"probes" (array of {{question, hint, answer, chapter_title}} — '
        "short comprehension checks the reader can answer in under a "
        "minute, answers grounded in the excerpts), "
        '"study_tips" (array of strings, at most 3, concrete actions). '
        "CRITICAL: write every value in the SAME LANGUAGE as the book "
        "title and excerpts. JSON keys stay English. " + COACH_GROUNDED_GUARD
    ),
    output_format="json",
    max_tokens=2000,
)

COACH_ASSESSMENT_HUMAN = PromptTemplate(
    key="coach.assessment.human",
    version=1,
    template=(
        'Assess comprehension for "{title}" by {author}.\n'
        "Progress: {progress}\n\n"
        "<reading_signals>\n{signals}\n</reading_signals>\n\n"
        "<recent_excerpts>\n{recent_content}\n</recent_excerpts>"
    ),
    variables=["title", "author", "progress", "signals", "recent_content"],
    output_format="text",
)
