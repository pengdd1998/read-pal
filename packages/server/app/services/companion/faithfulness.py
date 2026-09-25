"""Post-stream faithfulness filter (2026-09-26).

Prompt-level grounding constraints proved ineffective with glm-4-flash
(Qwen judge: Faithfulness 1.4/5, 30 hallucination sentences despite
4-rule constraint). This module takes the opposite approach: let the
model generate freely, then check each sentence against the retrieved
context AFTER the stream completes. Unsupported sentences trigger a
user-visible annotation (not silent deletion — the reader already saw
the text). Uses the same lightweight LLM (glm-4-flash) but as a
dedicated fact-checker with a focused single-purpose prompt, which
follows instructions far better than a multi-rule companion prompt.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.rag._constants import logger

# Maximum sentences to check in one LLM call (bounds latency/cost)
_MAX_SENTENCES = 30
_TIMEOUT_S = 5.0

_CHECK_PROMPT = """You are a strict fact-checker. Given book passages and an AI response, identify which sentences in the response make factual claims that are NOT supported by the passages.

A sentence is UNSUPPORTED if it:
- Names characters, places, or events not mentioned in the passages
- Attributes quotes or opinions to specific sources not in the passages
- Describes plot details or background not present in the passages

A sentence is SUPPORTED if it:
- Directly quotes or paraphrases passage content
- Is conversational filler (greetings, reactions, questions, transitions)
- Expresses uncertainty ("I'm not sure", "the passages don't cover this")

Return ONLY a JSON array of 0-based sentence indices that are UNSUPPORTED.
If all sentences are supported, return []

## Book passages
{context}

## AI response (sentences numbered)
{numbered_sentences}

JSON array of unsupported indices:"""


def _split_sentences(text: str) -> list[str]:
    """Split Chinese/English text into sentences on terminal punctuation."""
    # Keep terminal punctuation with the sentence
    parts = re.split(r'(?<=[。！？.!?\n])\s*', text)
    return [p.strip() for p in parts if p.strip() and len(p.strip()) > 1]


def _extract_context(messages: list[Any]) -> str:
    """Extract the RAG passages from the message list (the system prompt
    contains <book_passages>...</book_passages> from context assembly)."""
    for msg in messages:
        content = getattr(msg, 'content', '') or ''
        m = re.search(
            r'<book_passages>(.*?)</book_passages>', content, re.DOTALL,
        )
        if m:
            return m.group(1).strip()[:3000]
    return ''


async def check_faithfulness(
    answer: str, messages: list[Any],
) -> list[int] | None:
    """Check each sentence in the answer against the retrieved context.

    Returns a list of 0-based sentence indices that are unsupported,
    or None when the check is skipped (no context, too few sentences,
    or LLM failure — graceful degradation, never blocks the response).
    """
    from app.config import get_settings

    settings = get_settings()
    if not getattr(settings, 'faithfulness_check_enabled', False):
        return None

    context = _extract_context(messages)
    if not context or len(context) < 50:
        return None  # no RAG context to check against

    sentences = _split_sentences(answer)
    if len(sentences) < 2 or len(sentences) > _MAX_SENTENCES:
        return None  # too short to hallucinate, or too long to check

    numbered = '\n'.join(f'[{i}] {s}' for i, s in enumerate(sentences))
    prompt = _CHECK_PROMPT.format(
        context=context[:3000], numbered_sentences=numbered[:2000],
    )

    try:
        from langchain_core.messages import HumanMessage
        from app.services.llm.safe_invoke import safe_llm_call

        raw = await safe_llm_call(
            [HumanMessage(content=prompt)],
            log_label='companion.faithfulness_check',
            use_cache=False,
            max_tokens=200,  # just a JSON array of indices
        )
        if not raw:
            return None

        m = re.search(r'\[[\d\s,-]*\]', raw)
        if not m:
            return None
        indices = json.loads(m.group(0))
        # Validate: only int, within range
        valid = [i for i in indices if isinstance(i, int) and 0 <= i < len(sentences)]
        return valid if valid else None
    except Exception:  # noqa: BLE001 — filter is best-effort
        logger.debug('companion.faithfulness_check_failed')
        return None


def format_annotation(indices: list[int], answer: str) -> str:
    """Format a user-facing annotation for unsupported sentences."""
    sentences = _split_sentences(answer)
    flagged = [sentences[i] for i in indices if i < len(sentences)]
    if not flagged:
        return ''
    preview = flagged[0][:40] + ('…' if len(flagged[0]) > 40 else '')
    return (
        f'⚠️ 注意：以下内容可能不完全来自书中原文（共 {len(flagged)} 处），'
        f'例如「{preview}」。建议以原书为准。'
    )

