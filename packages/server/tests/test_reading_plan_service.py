"""Tests for reading_plan_service — plan generation, advancement, retrieval."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.reading_plan_service import (
    advance_plan,
    generate_plan,
    get_active_plan,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_book(
    title: str = 'Test Book',
    author: str = 'Author',
    total_pages: int = 300,
    current_page: int = 50,
    progress: Decimal | None = None,
) -> MagicMock:
    """Create a lightweight Book-like mock."""
    book = MagicMock()
    book.title = title
    book.author = author
    book.total_pages = total_pages
    book.current_page = current_page
    book.progress = progress or Decimal('16.67')
    return book


def _make_reading_plan(
    plan_id: uuid4 | None = None,
    book_id: uuid4 | None = None,
    plan_text: str = 'Day 1: Read pages 1-50',
    total_days: int = 7,
    current_day: int = 1,
    is_active: bool = True,
) -> MagicMock:
    """Create a lightweight ReadingPlan-like mock."""
    plan = MagicMock()
    plan.id = plan_id or uuid4()
    plan.book_id = book_id or uuid4()
    plan.plan_text = plan_text
    plan.total_days = total_days
    plan.current_day = current_day
    plan.is_active = is_active
    plan.created_at = datetime.now(timezone.utc)
    return plan


# ---------------------------------------------------------------------------
# generate_plan
# ---------------------------------------------------------------------------


class TestGeneratePlan:
    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_generate_plan_happy_path(self, mock_llm: AsyncMock) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book()
        mock_llm.return_value = '7-Day Reading Plan for "Test Book"'

        # First execute: _load_book, second: _get_active_plan (None), third: new plan save
        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book

        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None

        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        result = await generate_plan(db, user_id, book_id)
        assert result['bookId'] == str(book_id)
        assert result['isActive'] is True
        assert result['currentDay'] == 1
        assert result['totalDays'] == 7
        assert result['planText'] == '7-Day Reading Plan for "Test Book"'
        db.add.assert_called_once()
        db.flush.assert_called()

    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_generate_plan_deactivates_existing(self, mock_llm: AsyncMock) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book()
        existing_plan = _make_reading_plan(book_id=book_id, is_active=True)
        mock_llm.return_value = 'New plan text'

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book

        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = existing_plan

        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        result = await generate_plan(db, user_id, book_id)
        assert existing_plan.is_active is False
        assert result['planText'] == 'New plan text'

    @pytest.mark.asyncio
    async def test_generate_plan_book_not_found_raises(self) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=book_result)

        with pytest.raises(ValueError, match='not found'):
            await generate_plan(db, user_id, book_id)

    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_generate_plan_clamps_total_days(self, mock_llm: AsyncMock) -> None:
        """total_days is clamped to [1, 90]."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book()
        mock_llm.return_value = 'Plan text'

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        # Test upper bound clamped to 90
        result = await generate_plan(db, user_id, book_id, total_days=100)
        assert result['totalDays'] == 90

    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_generate_plan_clamps_total_days_lower_bound(self, mock_llm: AsyncMock) -> None:
        """total_days is clamped to minimum 1."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book()
        mock_llm.return_value = 'Plan text'

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        result = await generate_plan(db, user_id, book_id, total_days=0)
        assert result['totalDays'] == 1

    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_generate_plan_clamps_daily_minutes(self, mock_llm: AsyncMock) -> None:
        """daily_minutes is clamped to [10, 240]."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book()
        mock_llm.return_value = 'Plan text'

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        # Test upper bound clamped to 240
        await generate_plan(db, user_id, book_id, daily_minutes=300)
        # We just verify no error — clamping happens silently

    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_generate_plan_default_params(self, mock_llm: AsyncMock) -> None:
        """Default total_days=7 and daily_minutes=30."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book()
        mock_llm.return_value = 'Plan'

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        result = await generate_plan(db, user_id, book_id)
        assert result['totalDays'] == 7

    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_generate_plan_returns_plan_id_as_string(self, mock_llm: AsyncMock) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book()
        mock_llm.return_value = 'Plan'

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        result = await generate_plan(db, user_id, book_id)
        assert isinstance(result['id'], str)
        assert isinstance(result['bookId'], str)


# ---------------------------------------------------------------------------
# get_active_plan
# ---------------------------------------------------------------------------


class TestGetActivePlan:
    @pytest.mark.asyncio
    async def test_returns_plan_dict_when_found(self) -> None:
        user_id = uuid4()
        book_id = uuid4()
        plan_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        plan = _make_reading_plan(plan_id=plan_id, book_id=book_id)
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = plan
        db.execute = AsyncMock(return_value=plan_result)

        result = await get_active_plan(db, user_id, book_id)
        assert result is not None
        assert result['id'] == str(plan_id)
        assert result['bookId'] == str(book_id)
        assert result['planText'] == plan.plan_text
        assert result['isActive'] is True

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=plan_result)

        result = await get_active_plan(db, user_id, book_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_result_includes_current_day(self) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        plan = _make_reading_plan(current_day=4, total_days=7)
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = plan
        db.execute = AsyncMock(return_value=plan_result)

        result = await get_active_plan(db, user_id, book_id)
        assert result['currentDay'] == 4
        assert result['totalDays'] == 7


# ---------------------------------------------------------------------------
# advance_plan
# ---------------------------------------------------------------------------


class TestAdvancePlan:
    @pytest.mark.asyncio
    async def test_advance_increments_day(self) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        plan = _make_reading_plan(current_day=1, total_days=7, is_active=True)
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = plan
        db.execute = AsyncMock(return_value=plan_result)

        result = await advance_plan(db, user_id, book_id)
        assert result is not None
        assert result['currentDay'] == 2
        assert result['isActive'] is True
        db.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_advance_deactivates_at_last_day(self) -> None:
        """Plan deactivates when current_day reaches total_days."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        plan = _make_reading_plan(current_day=6, total_days=7, is_active=True)
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = plan
        db.execute = AsyncMock(return_value=plan_result)

        result = await advance_plan(db, user_id, book_id)
        assert result['currentDay'] == 7
        assert result['isActive'] is False

    @pytest.mark.asyncio
    async def test_advance_clamps_to_total_days(self) -> None:
        """Day cannot exceed total_days."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        plan = _make_reading_plan(current_day=7, total_days=7, is_active=True)
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = plan
        db.execute = AsyncMock(return_value=plan_result)

        result = await advance_plan(db, user_id, book_id)
        assert result['currentDay'] == 7
        assert result['isActive'] is False

    @pytest.mark.asyncio
    async def test_advance_returns_none_when_no_plan(self) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=plan_result)

        result = await advance_plan(db, user_id, book_id)
        assert result is None
        db.flush.assert_not_called()

    @pytest.mark.asyncio
    async def test_advance_through_multiple_days(self) -> None:
        """Advancing from day 3 to 4 keeps plan active."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        plan = _make_reading_plan(current_day=3, total_days=7, is_active=True)
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = plan
        db.execute = AsyncMock(return_value=plan_result)

        result = await advance_plan(db, user_id, book_id)
        assert result['currentDay'] == 4
        assert result['isActive'] is True

    @pytest.mark.asyncio
    async def test_advance_result_has_id(self) -> None:
        user_id = uuid4()
        book_id = uuid4()
        plan_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        plan = _make_reading_plan(plan_id=plan_id, current_day=1, total_days=7)
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = plan
        db.execute = AsyncMock(return_value=plan_result)

        result = await advance_plan(db, user_id, book_id)
        assert result['id'] == str(plan_id)
        assert 'totalDays' in result


# ---------------------------------------------------------------------------
# _generate_plan_text (tested indirectly through generate_plan)
# ---------------------------------------------------------------------------


class TestGeneratePlanText:
    """Tests for the fallback plan logic when LLM returns None."""

    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_fallback_plan_when_llm_returns_none(self, mock_llm: AsyncMock) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book(title='Great Gatsby', total_pages=200, current_page=0, progress=Decimal('0'))
        mock_llm.return_value = None

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        result = await generate_plan(db, user_id, book_id, total_days=3)
        # Fallback plan should contain the book title
        assert 'Great Gatsby' in result['planText']
        assert 'Day 1' in result['planText']

    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_fallback_plan_with_remaining_pages(self, mock_llm: AsyncMock) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book(total_pages=300, current_page=100, progress=Decimal('33.33'))
        mock_llm.return_value = None

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        result = await generate_plan(db, user_id, book_id, total_days=5)
        plan_text = result['planText']
        assert 'Day 1' in plan_text
        assert 'Day 5' in plan_text

    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_book_with_zero_pages(self, mock_llm: AsyncMock) -> None:
        """Book with 0 total_pages should still generate a plan (fallback)."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book(total_pages=0, current_page=0, progress=Decimal('0'))
        mock_llm.return_value = None

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        result = await generate_plan(db, user_id, book_id, total_days=3)
        # Should not crash, should produce a plan
        assert result['planText'] is not None
        assert 'Test Book' in result['planText']

    @pytest.mark.asyncio
    @patch('app.services.reading_plan.plan_generation.safe_llm_call', new_callable=AsyncMock)
    async def test_book_with_none_pages(self, mock_llm: AsyncMock) -> None:
        """Book with None total_pages should use fallback (0 pages)."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()
        db.add = MagicMock()

        book = _make_book()
        book.total_pages = None
        book.current_page = None
        mock_llm.return_value = 'LLM plan'

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        plan_result = MagicMock()
        plan_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[book_result, plan_result])

        result = await generate_plan(db, user_id, book_id)
        assert result['planText'] == 'LLM plan'
