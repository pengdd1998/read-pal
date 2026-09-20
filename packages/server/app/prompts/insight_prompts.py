"""Daily dashboard insight prompts (matrix J4).

One warm, specific sentence for the dashboard insight card, grounded in
real reader signals (current book, progress, annotation activity). The
frontend's static date-modulo pool remains the degradation fallback when
this returns empty — the pool stays honest only if the live path also
stays honest: no events beyond the stated reading progress, no invented
details.
"""

from __future__ import annotations

from app.prompts.base import PromptTemplate

INSIGHT_SYSTEM = PromptTemplate(
    key="dashboard.insight.system",
    version=1,
    template=(
        "You are the daily-insight writer for a reading companion app. "
        "Given a block of reader signals, write ONE sentence (max ~30 "
        "words) of warm, specific encouragement or observation that "
        "references the actual signals — the book being read, the pace, "
        "or the annotation activity. Write in the SAME LANGUAGE as the "
        "reader signals block states. NEVER reveal or hint at events "
        "beyond the stated reading progress (spoiler guard). Do not "
        "invent facts, quotes, or chapter events that are not in the "
        "signals. Output ONLY the sentence — no preamble, no quotes, "
        "no emoji."
    ),
    output_format="text",
    temperature=0.7,
    max_tokens=120,
)

INSIGHT_HUMAN = PromptTemplate(
    key="dashboard.insight.human",
    version=1,
    template="Reader signals:\n{signals}\n\nWrite the one-sentence daily insight now.",
    variables=["signals"],
    output_format="text",
)
