"""Step 4 regression: content_hash must land on BookChunk objects.

The first implementation stamped the EMBEDDING VECTOR list
(list[list[float] | None]) with chunk.content_hash — an AttributeError
that killed precompute after embeddings were already paid for, losing
every chunk (found by the 24h-change review, 2026-09-02).
"""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.rag import precompute


@pytest.mark.asyncio
async def test_content_hash_lands_on_chunk_objects():
    chapters = [{'title': 'T', 'content': 'x' * 50}]
    fake_vectors = [[0.1] * 4]

    with patch.object(precompute, '_embed_with_semaphore',
                      new=AsyncMock(return_value=fake_vectors)):
        chunks = await precompute._generate_chunks(
            uuid4(), uuid4(), chapters, content_hash='a' * 64,
        )

    assert chunks, 'chunks must be produced'
    for c in chunks:
        assert c.content_hash == 'a' * 64


@pytest.mark.asyncio
async def test_hash_already_embedded_skips_precompute():
    """Second upload of the same bytes pays zero embedding cost."""
    with patch.object(precompute, '_hash_already_embedded',
                      new=AsyncMock(return_value=True)), \
         patch.object(precompute, '_preflight_check', new=AsyncMock()) as preflight:
        await precompute.precompute_book_embeddings(
            uuid4(), uuid4(), [{'title': 'T', 'content': 'x'}],
            content_hash='a' * 64,
        )
        preflight.assert_not_awaited()
