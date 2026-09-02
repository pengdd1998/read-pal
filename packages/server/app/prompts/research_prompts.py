"""Research agent prompt templates (Phase 2 multi-agent, step 1).

The Research agent answers a question from excerpted passages retrieved
across the user's library (``rag/cross_book.py``). Synthesis is grounded
in numbered sources so every finding can cite ``source_id`` — the
citation guard below mirrors the synthesis sparse-data guard: thin
retrieval must produce an honest "not enough sources" answer, not
hallucinated passages from the model's memory of the books.
"""

from __future__ import annotations

from app.prompts.base import PromptTemplate

RESEARCH_CITATION_GUARD = (
    "Every finding MUST cite at least one source_id from the numbered "
    "sources. If the sources do not contain enough evidence to answer the "
    "question, do NOT invent passages or answer from your own memory of "
    'the books — say what is missing in "summary" and leave "findings" '
    "empty."
)

RESEARCH_SYSTEM = PromptTemplate(
    key="research.synthesis.system",
    version=1,
    template=(
        "You are a research assistant with access to numbered excerpt "
        "sources from the reader's personal library. Answer the research "
        "question using ONLY the numbered sources. Return ONLY valid JSON "
        "with these keys: "
        '"summary" (string, 2-4 sentences answering the question), '
        '"findings" (array of {{claim, evidence, source_id, book_title, '
        "chapter_title}} — evidence must quote or closely paraphrase the "
        "cited source), "
        '"follow_ups" (array of strings, suggested next research '
        "questions grounded in the sources). "
        "CRITICAL: write summary/claims/evidence in the SAME LANGUAGE as "
        "the research question. JSON keys stay English. " + RESEARCH_CITATION_GUARD
    ),
    output_format="json",
    max_tokens=2000,
)

RESEARCH_HUMAN = PromptTemplate(
    key="research.synthesis.human",
    version=1,
    template=("Research question: {question}\n\n<sources>\n{sources}\n</sources>"),
    variables=["question", "sources"],
    output_format="text",
)
