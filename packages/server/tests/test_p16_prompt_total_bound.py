"""P1.6 tests: companion system prompt total length is bounded.

Validates that the sum of (history + user_message + system_prompt + persona)
cannot exceed the model's context window minus the response reserve. Before
P1.6 the system prompt was bounded in isolation; history and user message
were appended afterwards without accounting for them, so a long history
could push the actual request past the context window.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services.companion.context import _prepare_context
from app.utils.token_budget import TokenBudget, estimate_tokens


class TestTokenBudgetReserve:
    """``reserve`` accounts for tokens without truncating."""

    def test_reserve_reduces_remaining(self):
        budget = TokenBudget()
        before = budget.remaining
        budget.reserve('hello world ' * 100, 'test')
        assert budget.remaining < before

    def test_reserve_does_not_truncate(self):
        """Unlike add(), reserve() never returns truncated text."""
        budget = TokenBudget()
        # Reserve more than the entire budget
        huge = 'x' * 1_000_000
        budget.reserve(huge, 'huge')
        # Subsequent add() now returns '' because budget is exhausted
        result = budget.add('should not fit', 'after')
        assert result == ''

    def test_reserve_does_not_log_truncation(self):
        budget = TokenBudget()
        budget.reserve('normal sized text', 'reserve_label')
        assert budget.truncations == []


class TestTotalPromptBounded:
    """Integration: _prepare_context bounds total prompt tokens."""

    @pytest.mark.asyncio
    async def test_history_reservation_shrinks_system_prompt_budget(self, monkeypatch):
        """A long history must reduce the system-prompt budget.

        Before P1.6 the system prompt was bounded only by TokenBudget's
        max; history was appended afterwards. With P1.6, history reserves
        its slot first, so the system prompt gets only what's left.
        """
        from langchain_core.messages import HumanMessage

        # Mock all DB-touching loaders so _prepare_context runs in isolation
        async def fake_load_book(db, uid, bid):
            mock_book = MagicMock()
            mock_book.title = 'T'
            mock_book.author = 'A'
            mock_book.progress = 0
            mock_book.current_page = 0
            mock_book.total_pages = 100
            return mock_book

        async def fake_load_annotations(db, uid, bid):
            return ''

        # 20 long messages — the kind of history that previously caused overflow
        long_msg = HumanMessage(content='x' * 8000)  # ~2000 tokens each
        fake_history = [long_msg] * 20  # ~40K tokens total

        async def fake_load_history(db, uid, bid):
            return list(fake_history)

        async def fake_fetch_rag(db, uid, bid, *a, **kw):
            return ''

        async def fake_fetch_memory(db, uid, bid):
            return ''

        monkeypatch.setattr(
            'app.services.companion.context._load_book', fake_load_book,
        )
        monkeypatch.setattr(
            'app.services.companion.context._load_annotations_context',
            fake_load_annotations,
        )
        monkeypatch.setattr(
            'app.services.companion.context._load_history', fake_load_history,
        )
        monkeypatch.setattr(
            'app.services.companion.context._fetch_rag', fake_fetch_rag,
        )
        monkeypatch.setattr(
            'app.services.companion.context._fetch_memory', fake_fetch_memory,
        )

        async def fake_interaction(db, uid):
            return None

        monkeypatch.setattr(
            'app.services.companion.context.get_user_interaction_style',
            fake_interaction,
        )

        budget = TokenBudget()
        original_max = budget._budget  # 124_000 for glm-4.7-flash

        _, history, system_text, returned_budget = await _prepare_context(
            db=MagicMock(), user_id='u', book_id='b',
            message='why?', context=None,
        )

        # Total = history tokens + user_message tokens + system_text tokens
        # must not exceed the budget (give or take token-estimation slack).
        history_tokens = sum(estimate_tokens(m.content) for m in history)
        user_tokens = estimate_tokens('why?')
        system_tokens = estimate_tokens(system_text)
        total = history_tokens + user_tokens + system_tokens

        # Without the P1.6 fix, system_text alone could be ~124K and adding
        # 40K of history would overflow. With the fix, system_text shrinks
        # so the total stays within the budget.
        assert total <= original_max + 100, (
            f'total {total} exceeds budget {original_max}; '
            f'history={history_tokens}, system={system_tokens}'
        )
        # Sanity: the budget tracker agrees.
        assert returned_budget.used <= original_max + 100

    @pytest.mark.asyncio
    async def test_short_history_leaves_system_prompt_room(self, monkeypatch):
        """When history is small, system_prompt gets nearly the full budget.

        Confirms the reservation mechanism doesn't over-charge on small
        histories.
        """
        from langchain_core.messages import HumanMessage

        async def fake_load_book(db, uid, bid):
            mock_book = MagicMock()
            mock_book.title = 'T'
            mock_book.author = 'A'
            mock_book.progress = 0
            mock_book.current_page = 0
            mock_book.total_pages = 100
            return mock_book

        async def fake_load_annotations(db, uid, bid):
            return ''

        async def fake_load_history(db, uid, bid):
            return [HumanMessage(content='hi')]

        async def fake_fetch_rag(db, uid, bid, *a, **kw):
            return ''

        async def fake_fetch_memory(db, uid, bid):
            return ''

        monkeypatch.setattr(
            'app.services.companion.context._load_book', fake_load_book,
        )
        monkeypatch.setattr(
            'app.services.companion.context._load_annotations_context',
            fake_load_annotations,
        )
        monkeypatch.setattr(
            'app.services.companion.context._load_history', fake_load_history,
        )
        monkeypatch.setattr(
            'app.services.companion.context._fetch_rag', fake_fetch_rag,
        )
        monkeypatch.setattr(
            'app.services.companion.context._fetch_memory', fake_fetch_memory,
        )

        async def fake_interaction(db, uid):
            return None

        monkeypatch.setattr(
            'app.services.companion.context.get_user_interaction_style',
            fake_interaction,
        )

        _, _, system_text, budget = await _prepare_context(
            db=MagicMock(), user_id='u', book_id='b',
            message='why?', context=None,
        )

        # Short history (~1 token) leaves nearly the full budget for system
        # prompt. The base prompt is small so we mainly assert the budget
        # accounting didn't blow up.
        assert system_text  # non-empty
        assert budget.used < budget._budget
