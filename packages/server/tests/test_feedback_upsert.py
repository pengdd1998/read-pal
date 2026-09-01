"""Re-rating the same message updates the row (ordinary CRUD semantics)."""
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.services import feedback_service


@pytest.mark.asyncio
async def test_rerating_updates_existing_row():
    db = AsyncMock()
    existing = MagicMock()
    existing.rating = True
    result = MagicMock()
    result.scalar_one_or_none.return_value = existing
    db.execute = AsyncMock(return_value=result)

    out = await feedback_service.submit_feedback(
        db, uuid4(), uuid4(), message_id=str(uuid4()), rating=False,
    )

    assert out['updated'] is True
    assert out['rating'] is False
    assert existing.rating is False
    db.add.assert_not_called()  # no duplicate row


@pytest.mark.asyncio
async def test_first_rating_inserts():
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()

    out = await feedback_service.submit_feedback(
        db, uuid4(), uuid4(), message_id=str(uuid4()), rating=True,
    )

    assert 'updated' not in out
    db.add.assert_called_once()
