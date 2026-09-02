"""Multi-mode synthesis prompt templates (Phase 2 multi-agent, step 3).

The synthesis panel's five tabs finally get real backends: these four
mode templates cover cross-reference tracing, concept mapping,
contradiction finding, and summary reports. All four share the grounded
guard — every claim must trace to a numbered source excerpt or to the
provided reading data, never to the model's memory of the books.

``synthesize`` (the fifth tab) intentionally has no template here: it
maps to the pre-existing single-book synthesis path.
"""

from __future__ import annotations

from app.prompts.base import PromptTemplate

SYNTHESIS_MODE_GROUNDED_GUARD = (
    "Ground every item in the numbered sources — cite the source_id you "
    "relied on. Do NOT use passages or claims that are not in the "
    "sources. If the sources are too thin, return an empty list for the "
    "main array rather than inventing content."
)

# ---------------------------------------------------------------------------
# Cross-reference: trace one concept through the library
# ---------------------------------------------------------------------------

CROSS_REFERENCE_SYSTEM = PromptTemplate(
    key="synthesis.cross_reference.system",
    version=1,
    template=(
        "You are a research assistant tracing one concept across the "
        "reader's library. Each numbered source is an excerpt from a "
        "different book. Classify what each excerpt does relative to the "
        'concept: "supporting" (agrees or elaborates), "contradicting" '
        '(opposes or undercuts), or "extending" (adds a new dimension). '
        "Return ONLY valid JSON with these keys: "
        '"concept" (string, restated), '
        '"source" ({{title, author}} of the book the concept came from), '
        '"analysis" (string, 2-4 sentences on how the library treats the '
        "concept), "
        '"references" (array of {{book: {{title, author}}, type, '
        "explanation}} — one per relevant source, type is "
        "supporting|contradicting|extending). "
        "CRITICAL: write values in the SAME LANGUAGE as the sources. "
        "JSON keys stay English. " + SYNTHESIS_MODE_GROUNDED_GUARD
    ),
    output_format="json",
    max_tokens=2000,
)

CROSS_REFERENCE_HUMAN = PromptTemplate(
    key="synthesis.cross_reference.human",
    version=1,
    template=(
        'Trace the concept "{concept}" (analysis focus: {analysis_type}) '
        'from "{source_title}" by {source_author}.\n\n'
        "<sources>\n{sources}\n</sources>"
    ),
    variables=["concept", "analysis_type", "source_title", "source_author", "sources"],
    output_format="text",
)

# ---------------------------------------------------------------------------
# Concept map: topic → graph
# ---------------------------------------------------------------------------

CONCEPT_MAP_SYSTEM = PromptTemplate(
    key="synthesis.concept_map.system",
    version=1,
    template=(
        "You are a knowledge-graph builder for the reader's library. "
        "From the numbered sources, build a concept map of the topic. "
        "Return ONLY valid JSON with these keys: "
        '"nodes" (array of {{id, label, type, weight}} — id is a short '
        "slug unique in the map, type is concept|book|author|theme, "
        "weight is 0.0-1.0 importance), "
        '"edges" (array of {{source, target, label, strength}} — '
        "source/target are node ids, strength is 0.0-1.0). "
        "Include a node for each contributing book; respect the node "
        "cap given in the request. "
        "CRITICAL: labels in the SAME LANGUAGE as the sources. JSON "
        "keys stay English. " + SYNTHESIS_MODE_GROUNDED_GUARD
    ),
    output_format="json",
    max_tokens=2000,
)

CONCEPT_MAP_HUMAN = PromptTemplate(
    key="synthesis.concept_map.human",
    version=1,
    template=(
        'Build a concept map for the topic "{topic}" with at most '
        "{max_nodes} nodes.\n\n"
        "<sources>\n{sources}\n</sources>"
    ),
    variables=["topic", "max_nodes", "sources"],
    output_format="text",
)

# ---------------------------------------------------------------------------
# Contradictions: where the books disagree
# ---------------------------------------------------------------------------

CONTRADICTIONS_SYSTEM = PromptTemplate(
    key="synthesis.contradictions.system",
    version=1,
    template=(
        "You are a critical-reading assistant finding where the reader's "
        "books genuinely disagree. From the numbered sources, surface "
        "contradictions: two sources taking incompatible positions on "
        "the same topic. Return ONLY valid JSON with these keys: "
        '"contradictions" (array of {{topic, position1: {{book: {{title, '
        "author}}, claim}}, position2: {{book: {{title, author}}, claim}}, "
        "severity, analysis}} — severity is low|medium|high, claims "
        "paraphrase the two sources, analysis explains the disagreement). "
        "Only report real tension visible in the sources — adjacent "
        "topics or complementary views are NOT contradictions. "
        "CRITICAL: values in the SAME LANGUAGE as the sources. JSON keys "
        "stay English. " + SYNTHESIS_MODE_GROUNDED_GUARD
    ),
    output_format="json",
    max_tokens=2000,
)

CONTRADICTIONS_HUMAN = PromptTemplate(
    key="synthesis.contradictions.human",
    version=1,
    template=(
        "Find contradictions (minimum severity: {min_severity})"
        "{topic_clause}.\n\n"
        "<sources>\n{sources}\n</sources>"
    ),
    variables=["min_severity", "topic_clause", "sources"],
    output_format="text",
)

# ---------------------------------------------------------------------------
# Summary report: cross-book reading-data report
# ---------------------------------------------------------------------------

SUMMARY_REPORT_SYSTEM = PromptTemplate(
    key="synthesis.summary_report.system",
    version=1,
    template=(
        "You are a reading analyst writing a summary report across the "
        "reader's books from their reading data (highlights, notes, "
        "conversations, session history). Return ONLY valid JSON with "
        "these keys: "
        '"report" (string — the full report; respect the requested '
        "format: narrative=flowing prose, structured=headed sections "
        "with bullets, academic=formal with citations to book titles), "
        '"insights" (array of strings, the 3-5 strongest takeaways). '
        "The response must mention every book that has data. "
        "CRITICAL: write in the SAME LANGUAGE as the reading data. "
        "JSON keys stay English. "
        "Do NOT invent highlights or notes that are not in the data; "
        "books with minimal data get one honest sentence, not padding."
    ),
    output_format="json",
    max_tokens=2500,
)

SUMMARY_REPORT_HUMAN = PromptTemplate(
    key="synthesis.summary_report.human",
    version=1,
    template=(
        "Write a {report_format} summary report{focus_clause} across "
        "these books.\n\n"
        "<reading_data>\n{data}\n</reading_data>"
    ),
    variables=["report_format", "focus_clause", "data"],
    output_format="text",
)
