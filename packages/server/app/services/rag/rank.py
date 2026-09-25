"""Post-fusion ranking stages (P1 + P2, 2026-09-24 0.95 push).

Split from search.py at the 400-line file cap. Two stages run after RRF
fusion, in order:

- P1 ``chapter_coverage_merge`` — zero-dependency coverage guarantee:
  the last top-k slot goes to the best chunk of the strongest chapter
  not yet represented (probe: gold chapter in pool-50 for 100% of
  paraphrase cases, only 57% in top-5).
- P2 ``rerank_chunks`` — cross-encoder scoring over the merged
  candidates when a rerank API is configured; any failure falls back to
  the P1 order.
"""

from __future__ import annotations

import re
from typing import Any

from app.services.rag._constants import RRF_K

# Candidate-pool floor for fusion + chapter aggregation. Probe-measured
# (2026-09-24): gold chapter present in fused pool 50/50 for every
# paraphrase eval case; 20 already carries 93%.
_FUSION_POOL_FLOOR = 50


def _chapter_of(chunk: dict[str, Any]) -> str:
    """Chapter label from the chunker's [title] prefix (stable scope key)."""
    m = re.match(r'\[([^\]]*)\]', chunk.get('content') or '')
    return m.group(1) if m else ''


def chapter_coverage_merge(
    fused: list[dict[str, Any]], top_k: int = 5,
) -> list[dict[str, Any]]:
    """P1 chapter-coverage merge (2026-09-24 0.95 push, zero-dependency).

    Vague thematic queries scatter their signal across several chunks of
    the RIGHT chapter — each individually ranks below single lucky chunks
    of wrong chapters, so top-k truncation drops the right chapter even
    though it is present in the pool (probe: gold chapter in pool-50 for
    100% of paraphrase cases, but only 57% in top-5).

    Coverage guarantee instead of re-scoring: the first k-1 slots keep
    the fused order untouched (exact-phrase queries keep their ~100%
    hit rate), and the LAST slot goes to the best chunk of the
    highest-scoring chapter not yet represented — chapter score =
    max chunk RRF + 0.3 × mean(top-3 chunk RRFs) over the whole pool.
    Multiplicative boosts were rejected by numeric check: RRF scores are
    too flat near the top for aggregation arithmetic to flip ranks
    without also flipping strong single hits.
    """
    if top_k < 2 or len(fused) <= top_k:
        return fused

    head = fused[:top_k - 1]
    tail = fused[top_k - 1:]
    head_chapters = {_chapter_of(c) for c in head}

    by_chapter: dict[str, list[float]] = {}
    for rank in range(len(fused)):
        by_chapter.setdefault(_chapter_of(fused[rank]), []).append(
            1.0 / (RRF_K + rank + 1),
        )
    chapter_scores = {}
    for ch, scores in by_chapter.items():
        top3 = sorted(scores, reverse=True)[:3]
        chapter_scores[ch] = max(scores) + 0.3 * (sum(top3) / len(top3))

    uncovered = [ch for ch in chapter_scores if ch not in head_chapters]
    if not uncovered:
        return fused
    best_ch = max(uncovered, key=lambda ch: chapter_scores[ch])
    for chunk in tail:
        if _chapter_of(chunk) == best_ch:
            return head + [chunk] + [c for c in tail if c is not chunk]
    return fused


async def rerank_chunks(
    query: str, chunks: list[dict[str, Any]],
) -> list[dict[str, Any]] | None:
    """P2 cross-encoder rerank with hybrid scoring (P1-1, 2026-09-25).

    Blends rather than replaces: ``final = 0.6 × embedding_sim +
    0.4 × rerank_score`` (both normalized to [0,1]). Pure replacement
    (the original P2) promoted single best passages at the cost of
    coverage diversity — hit@5 dropped in multi-anchor A/B. The blend
    keeps the reranker's precision gain while preserving the semantic
    ordering's diversity.

    Returns None when disabled or on any failure — the caller then keeps
    the P1 ordering (graceful degradation, same contract as the embedding
    fallbacks).
    """
    from app.services.rag.rerank import CANDIDATE_CAP, rerank_passages

    candidates = chunks[:CANDIDATE_CAP]
    if len(candidates) < 2:
        return None
    scores = await rerank_passages(query, [c.get('content') or '' for c in candidates])
    if scores is None:
        return None

    # Normalize both signals to [0,1] then blend
    sim_values = [c.get('similarity') or 0.0 for c in candidates]
    sim_max = max(sim_values) if sim_values else 1.0
    sim_max = max(sim_max, 1e-9)
    rnk_max = max(scores) if scores else 1.0
    rnk_max = max(abs(rnk_max), 1e-9)

    final_scores = [
        0.6 * (sim_values[i] / sim_max) + 0.4 * (scores[i] / rnk_max)
        for i in range(len(candidates))
    ]
    order = sorted(range(len(candidates)), key=lambda i: final_scores[i], reverse=True)
    return [candidates[i] for i in order]
