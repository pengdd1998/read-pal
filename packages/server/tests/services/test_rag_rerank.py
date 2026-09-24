"""P1 chapter-aggregation boost + P2 rerank integration (2026-09-24 0.95 push).

Probes that motivated the design (measured on the eval book):
- gold chapter in fused pool-50: 14/14 paraphrase cases (recall intact);
- neighbor expansion alone: paraphrase 14%→21% (in-chunk granularity is
  NOT the bottleneck — chapter-level ordering is);
- single strong hits must keep rank #1 (original-type is ~100% today).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.rag.rank import chapter_coverage_merge
from app.services.rag.search import hybrid_chunk_search


def _chunk(chapter: str, body: str) -> dict:
    return {'title': chapter, 'content': f'[{chapter}]\n{body}', 'similarity': 0.5}


class TestChapterCoverageMerge:
    def test_last_slot_covers_unrepresented_concentrated_chapter(self):
        # Fused order: two wrong-chapter chunks, then the right chapter's
        # cluster. top_k=3 keeps the two head slots untouched and spends
        # the last slot on the right chapter's best chunk.
        fused = (
            [_chunk('wrong', 'lucky single hit'), _chunk('other', 'noise 0')]
            + [_chunk('right', f'relevant passage {i}') for i in range(4)]
            + [_chunk('other', f'noise {i}') for i in range(1, 6)]
        )
        out = chapter_coverage_merge(fused, top_k=3)
        assert [c['title'] for c in out[:2]] == ['wrong', 'other']  # head intact
        assert out[2]['title'] == 'right'  # coverage slot

    def test_single_strong_hits_stay_in_head(self):
        # The original-type signature: exact-phrase chunks at the top —
        # the head slots must never be disturbed.
        fused = (
            [_chunk('exact', 'the quoted phrase verbatim'), _chunk('exact2', 'second hit')]
            + [_chunk('a', f'x{i}') for i in range(4)]
            + [_chunk('b', f'y{i}') for i in range(5)]
        )
        out = chapter_coverage_merge(fused, top_k=3)
        assert [c['title'] for c in out[:2]] == ['exact', 'exact2']

    def test_no_uncovered_chapter_is_noop(self):
        fused = [_chunk('only', f'p{i}') for i in range(6)]
        assert chapter_coverage_merge(fused, top_k=3) == fused

    def test_short_list_is_noop(self):
        fused = [_chunk('c', 'x')]
        assert chapter_coverage_merge(fused, top_k=3) == fused


class TestHybridRerankIntegration:
    @pytest.mark.asyncio
    async def test_rerank_failure_keeps_p1_order(self):
        """API error / disabled → the chapter-boosted order survives intact."""
        from unittest.mock import MagicMock

        with (
            patch('app.services.rag.search._semantic_chapter_search',
                  new=AsyncMock(return_value=[_chunk('right', f'p{i}') for i in range(6)])),
            patch('app.services.rag.search._keyword_chunk_search',
                  new=AsyncMock(return_value=[])),
            patch('app.services.rag.search.get_query_embedding',
                  new=AsyncMock(return_value=[0.1] * 4)),
            patch('app.config.get_settings',
                  return_value=MagicMock(rerank_api_key='k', rerank_base_url='https://x', rerank_model='m')),
            patch('app.services.rag.rerank._get_http_client',
                  side_effect=RuntimeError('network down')),
        ):
            out = await hybrid_chunk_search(MagicMock(), object(), 'q', top_k=3)
        assert len(out) == 3
        assert all(c['title'] == 'right' for c in out)

    @pytest.mark.asyncio
    async def test_rerank_reorders_by_relevance(self):
        """The reranker's ordering wins when it returns scores."""
        from unittest.mock import MagicMock

        sem = [_chunk('right', f'passage {i}') for i in range(5)]

        def fake_post(*_args, **_kwargs):
            class R:
                def raise_for_status(self):
                    return None

                def json(self):
                    # passage 4 is the most relevant, passage 0 the least
                    return {'results': [
                        {'index': 4, 'relevance_score': 0.98},
                        {'index': 2, 'relevance_score': 0.55},
                        {'index': 0, 'relevance_score': 0.11},
                    ]}

            return R()

        client = MagicMock()
        client.post = AsyncMock(side_effect=fake_post)
        with (
            patch('app.services.rag.search._semantic_chapter_search',
                  new=AsyncMock(return_value=sem)),
            patch('app.services.rag.search._keyword_chunk_search',
                  new=AsyncMock(return_value=[])),
            patch('app.services.rag.search.get_query_embedding',
                  new=AsyncMock(return_value=[0.1] * 4)),
            patch('app.config.get_settings',
                  return_value=MagicMock(rerank_api_key='k', rerank_base_url='https://x', rerank_model='m')),
            patch('app.services.rag.rerank._get_http_client', return_value=client),
        ):
            out = await hybrid_chunk_search(MagicMock(), object(), 'q', top_k=3)
        assert [c['content'].splitlines()[1] for c in out] == ['passage 4', 'passage 2', 'passage 0']

    @pytest.mark.asyncio
    async def test_rerank_disabled_by_default(self):
        """No key configured → rerank_passages returns None without any HTTP."""
        with (
            patch('app.services.rag.search._semantic_chapter_search',
                  new=AsyncMock(return_value=[_chunk('c', f'p{i}') for i in range(4)])),
            patch('app.services.rag.search._keyword_chunk_search',
                  new=AsyncMock(return_value=[])),
            patch('app.services.rag.search.get_query_embedding',
                  new=AsyncMock(return_value=[0.1] * 4)),
            patch('app.config.get_settings') as gs,
        ):
            gs.return_value = MagicMock(rerank_api_key=None)
            with patch('app.services.rag.rerank._get_http_client') as gc:
                out = await hybrid_chunk_search(MagicMock(), object(), 'q', top_k=3)
                gc.assert_not_called()
        assert len(out) == 3
