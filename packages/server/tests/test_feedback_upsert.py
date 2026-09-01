"""Feedback rating semantics — re-rating upserts (ordinary CRUD)."""
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.services import feedback_service


def _rows(*ratings):
    rows = []
    for r in ratings:
        row = MagicMock()
        row.rating = r
        rows.append(row)
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(rows)
    return rows, result


@pytest.mark.asyncio
async def test_rerating_updates_newest_and_keeps_single_row():
    db = AsyncMock()
    rows, result = _rows(True)
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()

    out = await feedback_service.submit_feedback(
        db, uuid4(), uuid4(), message_id=str(uuid4()), rating=False,
    )

    assert out['updated'] is True
    assert rows[0].rating is False
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_legacy_duplicates_collapsed():
    db = AsyncMock()
    rows, result = _rows(True, False)  # newest, older duplicate
    db.execute = AsyncMock(return_value=result)
    db.delete = AsyncMock()

    out = await feedback_service.submit_feedback(
        db, uuid4(), uuid4(), message_id=str(uuid4()), rating=False,
    )

    assert out['updated'] is True
    assert rows[0].rating is False
    db.delete.assert_awaited_once_with(rows[1])


@pytest.mark.asyncio
async def test_first_rating_inserts():
    db = AsyncMock()
    rows, result = _rows()
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()

    out = await feedback_service.submit_feedback(
        db, uuid4(), uuid4(), message_id=str(uuid4()), rating=True,
    )

    assert 'updated' not in out
    db.add.assert_called_once()
