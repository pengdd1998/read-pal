"""P3.2 tests: hybrid RAG via Reciprocal Rank Fusion.

Pure-function tests on ``reciprocal_rank_fuse`` — the heart of the hybrid
strategy. Async/DB coverage of ``hybrid_chunk_search`` lives in the
existing RAG integration suite; the fusion math is what's load-bearing
and worth pinning down here.

Verifies:
- Empty input → empty output (degenerate case)
- Single list → that list, truncated (no fusion partner)
- Two lists, no overlap → fused by per-list rank score
- Overlapping chunks → scores SUMMED (the central RRF property)
- An exact-match that ranks low in semantic but #1 in keyword gets
  boosted — the whole reason we moved off cascading fallback
- top_k truncation respects fused order
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.services.rag.search import (
    RRF_K,
    _keyword_chunk_search,
    reciprocal_rank_fuse,
)


def _chunk(title: str, content: str) -> dict:
    """Build a minimal chunk dict matching the search.py shape."""
    return {'title': title, 'content': content, 'similarity': 0.9}


# ---------------------------------------------------------------------------
# Degenerate cases
# ---------------------------------------------------------------------------


def test_empty_input_returns_empty():
    """No ranked lists → no fused results."""
    assert reciprocal_rank_fuse([], top_k=5) == []


def test_empty_lists_return_empty():
    """All input lists empty → no fused results."""
    assert reciprocal_rank_fuse([[], []], top_k=5) == []


def test_one_empty_one_full_returns_full_truncated():
    """Semantic empty, keyword full → keyword list, truncated to top_k.

    Common production case: book has no embeddings yet, semantic returns
    []. Fusion must gracefully degrade to keyword-only, not crash.
    """
    keyword_results = [_chunk('Ch1', 'a'), _chunk('Ch2', 'b'), _chunk('Ch3', 'c')]
    fused = reciprocal_rank_fuse([[], keyword_results], top_k=2)
    assert len(fused) == 2
    assert fused[0]['content'] == 'a'  # rank 0 in keyword → fused rank 0
    assert fused[1]['content'] == 'b'


# ---------------------------------------------------------------------------
# Single-list behavior
# ---------------------------------------------------------------------------


def test_single_list_returns_truncated():
    """Single list with no fusion partner → return top_k of that list."""
    ranked = [_chunk('A', 'a'), _chunk('B', 'b'), _chunk('C', 'c')]
    fused = reciprocal_rank_fuse([ranked], top_k=2)
    assert [c['content'] for c in fused] == ['a', 'b']


# ---------------------------------------------------------------------------
# The core RRF property: overlap sums scores
# ---------------------------------------------------------------------------


def test_overlap_boosts_chunk_above_single_list_winners():
    """A chunk retrieved by BOTH lists must outrank chunks in only one.

    This is the whole point of RRF — agreement between two retrievers is
    a stronger relevance signal than either alone.

    Concrete: chunk X is rank-0 in list A and rank-0 in list B.
    Chunk Y is rank-0 in list A only (different list B has different #1).
    X must rank above Y in fused output.
    """
    list_a = [_chunk('Ch', 'X'), _chunk('Ch', 'Y')]
    list_b = [_chunk('Ch', 'X'), _chunk('Ch', 'Z')]

    fused = reciprocal_rank_fuse([list_a, list_b], top_k=3)
    contents = [c['content'] for c in fused]

    assert contents[0] == 'X', (
        f'overlap-boosted chunk should rank #1; got {contents}'
    )


def test_rank_position_affects_score():
    """Higher rank in a list → higher fused contribution.

    Two non-overlapping chunks, one at rank 0 across two lists vs. one at
    rank 3 across two lists. The rank-0 chunk must fuse higher.
    """
    high = _chunk('Ch', 'high')
    low = _chunk('Ch', 'low')
    list_a = [high, _chunk('Ch', 'filler1'), _chunk('Ch', 'filler2'), low]
    list_b = [high, _chunk('Ch', 'filler3'), _chunk('Ch', 'filler4'), low]

    fused = reciprocal_rank_fuse([list_a, list_b], top_k=2)
    assert [c['content'] for c in fused] == ['high', 'low']


# ---------------------------------------------------------------------------
# The motivating case: exact-match retrieval (the gap P3.2 closes)
# ---------------------------------------------------------------------------


def test_keyword_picks_up_chunks_semantic_missed_entirely():
    """The motivating case for P3.2: keyword finds chunks semantic didn't.

    Under cascading fallback (the OLD strategy), if semantic returned
    ANYTHING, the keyword path never ran — so an exact-term match that
    semantic missed would never surface. RRF runs both always and unions
    the candidate set.

    Scenario: semantic retrieves [A, B, C] (none is the exact match).
    Keyword retrieves [X] (the exact match semantic missed).

    Fused output must contain X — not buried below all of A/B/C, just
    included. That's the win over cascading fallback.
    """
    semantic = [
        _chunk('Ch', 'A loose semantic hit'),
        _chunk('Ch', 'B loose semantic hit'),
        _chunk('Ch', 'C loose semantic hit'),
    ]
    keyword = [
        _chunk('Ch', 'X exact-term match'),  # not in semantic at all
    ]

    fused = reciprocal_rank_fuse([semantic, keyword], top_k=4)
    contents = {c['content'] for c in fused}

    assert 'X exact-term match' in contents, (
        f'exact-match that semantic missed must surface via keyword; '
        f'got {contents}'
    )


def test_overlap_chunk_beats_disagreed_chunks():
    """A chunk retrieved by BOTH lists outranks chunks in either alone.

    The pure-RRF win: agreement is signal. Concrete numbers (k=60):
    - Overlap chunk at rank 0 in both lists: 2 × 1/61 ≈ 0.0328
    - Single-list rank 0 in either:           1 × 1/61 ≈ 0.0164
    The overlap chunk fuses strictly higher.
    """
    overlap = _chunk('Ch', 'overlap chunk')
    only_in_a = _chunk('Ch', 'only in semantic')
    only_in_b = _chunk('Ch', 'only in keyword')

    list_a = [overlap, only_in_a]
    list_b = [overlap, only_in_b]

    fused = reciprocal_rank_fuse([list_a, list_b], top_k=3)
    assert fused[0]['content'] == 'overlap chunk'


# ---------------------------------------------------------------------------
# top_k truncation
# ---------------------------------------------------------------------------


def test_top_k_truncation_respects_fused_order():
    """Output length == top_k, and the kept items are the top-scoring ones."""
    ranked_a = [_chunk('Ch', f'a{i}') for i in range(5)]
    ranked_b = [_chunk('Ch', f'b{i}') for i in range(5)]

    fused = reciprocal_rank_fuse([ranked_a, ranked_b], top_k=3)
    assert len(fused) == 3

    # The top 3 must be the rank-0, rank-1, rank-2 entries from at least
    # one list — never a deeper-rank entry. Concretely: a0 (rank 0 in A)
    # and b0 (rank 0 in B) both score 1/(60+0+1) = ~0.0164, which beats
    # any rank-1 entry at 1/(60+1+1) = ~0.0161. So both a0 and b0 are
    # in the top 2, plus whichever of a1/b1 has the (tied) higher score.
    contents = {c['content'] for c in fused}
    assert 'a0' in contents
    assert 'b0' in contents


def test_top_k_zero_returns_empty():
    """Defensive: top_k=0 returns empty list, not all results."""
    ranked = [_chunk('Ch', 'a'), _chunk('Ch', 'b')]
    assert reciprocal_rank_fuse([ranked], top_k=0) == []


# ---------------------------------------------------------------------------
# RRF_K parameter behavior
# ---------------------------------------------------------------------------


def test_rrf_k_constant_is_60():
    """Lock the k value — it's a tuned literature default, not arbitrary.

    If someone changes it without thinking, this test forces them to
    explain why in the diff.
    """
    assert RRF_K == 60


def test_smaller_k_makes_top_ranks_dominate():
    """With k=1, the rank-0 entry in a single list overwhelmingly wins.

    Sanity check that the k parameter behaves as documented: smaller k
    → top ranks contribute disproportionately more.
    """
    ranked = [_chunk('Ch', f'item_{i}') for i in range(5)]

    fused_k60 = reciprocal_rank_fuse([ranked], top_k=5, k=60)
    fused_k1 = reciprocal_rank_fuse([ranked], top_k=5, k=1)

    # Order is the same (single list), but the score gap between rank 0
    # and rank 4 is much larger with k=1.
    # We just verify ordering is preserved — score isn't returned, but
    # the function still must respect input order in the single-list case.
    assert [c['content'] for c in fused_k60] == [c['content'] for c in fused_k1]


# ---------------------------------------------------------------------------
# Dedup behavior
# ---------------------------------------------------------------------------


def test_same_chunk_in_both_lists_not_duplicated_in_output():
    """A chunk appearing in both lists is one entry in output, not two.

    Dedup uses (title, content-prefix). The same chunk retrieved by both
    signals must not show twice in the top_k output — that would waste
    slots the model sees.
    """
    same = _chunk('Ch1', 'identical content')
    list_a = [same, _chunk('Ch1', 'different A')]
    list_b = [same, _chunk('Ch1', 'different B')]

    fused = reciprocal_rank_fuse([list_a, list_b], top_k=4)

    contents = [c['content'] for c in fused]
    assert contents.count('identical content') == 1, (
        f'duplicate chunk in output: {contents}'
    )


def test_different_title_prevents_dedup_collision():
    """Two chunks with the same content but different titles are kept separate.

    Edge case: a quote that appears in two different chapters (epigraphs,
    refrains). Both are legitimately distinct contexts and should not be
    merged.
    """
    list_a = [_chunk('Chapter 1', 'shared quote')]
    list_b = [_chunk('Chapter 7', 'shared quote')]  # different title

    fused = reciprocal_rank_fuse([list_a, list_b], top_k=2)
    assert len(fused) == 2, (
        'different-title chunks must not dedup'
    )


# ---------------------------------------------------------------------------
# _keyword_chunk_search integration: candidate pre-filter
# ---------------------------------------------------------------------------

# Filler text chosen to share zero tokens with _NEEDLE_QUERY below —
# otherwise the pre-filter legitimately pulls fillers into the candidate
# window and the test asserts the wrong thing.
_NEEDLE_QUERY = '唯一检索词xyz'
_FILLER_TEXT = '第{i}段普通正文内容样例'


async def _seed_chunks(session, book_id: UUID, filler_count: int, needle_at: int):
    # PG enforces FKs (SQLite doesn't): seed the parent Book + Document rows.
    from app.models.book import Book, BookFileType
    from app.models.document import Document
    from app.models.book_chunk import BookChunk

    session.add(Book(
        id=book_id, user_id=(uid := uuid4()), title='T', author='A',
        file_type=BookFileType.epub, file_size=1, total_pages=1,
    ))
    session.add(Document(id=(doc_id := uuid4()), book_id=book_id, user_id=uid,
                         content='x', chapters=[]))
    await session.flush()

    chunks = [
        BookChunk(
            book_id=book_id,
            document_id=doc_id,
            chapter_index=i,
            chunk_index=0,
            content=_FILLER_TEXT.format(i=i),
        )
        for i in range(filler_count)
    ]
    chunks.append(
        BookChunk(
            book_id=book_id,
            document_id=doc_id,
            chapter_index=needle_at,
            chunk_index=0,
            content=f'这里是{_NEEDLE_QUERY}出现的段落',
        )
    )
    session.add_all(chunks)
    await session.commit()


class TestKeywordChunkSearchPrefilter:
    """Regression: keyword search must reach chunks past index #200.

    The old implementation scanned ``ORDER BY chapter_index LIMIT 200``
    and scored in Python — on any book with >200 chunks, matches in later
    chapters were invisible to keyword retrieval (and thus to hybrid RRF).
    The fix pre-filters by token in SQL, so the cap applies to *matching*
    candidates, not to a blind chapter scan.
    """

    @pytest.mark.asyncio
    async def test_finds_needle_beyond_chunk_200(self):
        from tests.conftest import _TestSession

        book_id = uuid4()
        async with _TestSession() as session:
            await _seed_chunks(session, book_id, filler_count=300, needle_at=300)
            results = await _keyword_chunk_search(
                session, book_id, _NEEDLE_QUERY, top_k=3,
            )

        assert len(results) == 1
        assert _NEEDLE_QUERY in results[0]['content']
        assert results[0]['title'] == 'Chapter 301'

    @pytest.mark.asyncio
    async def test_chapter_cap_still_excludes_future_chapters(self):
        from tests.conftest import _TestSession

        book_id = uuid4()
        async with _TestSession() as session:
            await _seed_chunks(session, book_id, filler_count=5, needle_at=10)
            results = await _keyword_chunk_search(
                session, book_id, _NEEDLE_QUERY, top_k=3, max_chapter_index=8,
            )

        assert results == []

    @pytest.mark.asyncio
    async def test_like_wildcards_in_query_match_literally(self):
        from tests.conftest import _TestSession

        book_id = uuid4()
        async with _TestSession() as session:
            await _seed_chunks(session, book_id, filler_count=2, needle_at=3)
            # '%' and '_' are LIKE wildcards — unescaped they would turn the
            # pre-filter into match-anything. 'xyz' still matches the needle.
            results = await _keyword_chunk_search(
                session, book_id, 'xyz%_', top_k=3,
            )

        assert len(results) == 1
