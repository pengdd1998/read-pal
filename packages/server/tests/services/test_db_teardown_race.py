"""P7.5 regression: get_db teardown-race handler must actually catch.

sqlalchemy's ``InterfaceError`` SUBCLASSES ``DBAPIError``. The historical
``except DBAPIError: rollback; raise`` before ``except InterfaceError``
made the teardown-race handler dead code — the race re-raised as an
unhandled 500 (research-stream cancel, 2026-09-20). These tests pin the
ordering: InterfaceError from the teardown commit is absorbed; any other
DBAPIError still re-raises.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.exc import DBAPIError, InterfaceError

import app.db as db_mod
from app.db import get_db


def _fake_session_factory(commit_exc: BaseException | None) -> MagicMock:
    """Build an async context manager yielding a session whose teardown
    commit raises ``commit_exc``."""
    session = MagicMock()
    session.commit = AsyncMock(side_effect=commit_exc) if commit_exc else AsyncMock()
    session.rollback = AsyncMock()
    session.close = AsyncMock()

    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=session)
    ctx.__aexit__ = AsyncMock(return_value=False)
    factory = MagicMock(return_value=ctx)
    return factory


async def _drive(factory) -> MagicMock:
    """Drive get_db the way FastAPI does: first __anext__ yields the
    session, the second runs the teardown (commit + excepts + close).
    aclose() would throw GeneratorExit at the yield and skip teardown."""
    import contextlib

    gen = get_db()
    session = await gen.__anext__()
    with contextlib.suppress(StopAsyncIteration):
        await gen.__anext__()
    return session


class TestGetDbTeardownOrdering:
    @pytest.mark.asyncio
    async def test_interface_error_from_teardown_commit_is_absorbed(self):
        """P7.5: the race (connection returned by release_db, then client
        disconnected) must log + rollback, never escape as a 500."""
        factory = _fake_session_factory(
            InterfaceError(statement=None, params=None, orig=Exception("conn closed"))
        )
        with patch.object(db_mod, "async_session", factory):
            session = await _drive(factory)
        session.rollback.assert_awaited()

    @pytest.mark.asyncio
    async def test_other_dbapi_error_still_reraises(self):
        """Query-time DBAPIErrors keep their original contract: rollback
        and propagate so the request fails loudly."""
        factory = _fake_session_factory(
            DBAPIError(statement=None, params=None, orig=Exception("boom"))
        )
        with patch.object(db_mod, "async_session", factory):
            with pytest.raises(DBAPIError):
                await _drive(factory)

    @pytest.mark.asyncio
    async def test_clean_teardown_commits_and_closes(self):
        factory = _fake_session_factory(None)
        with patch.object(db_mod, "async_session", factory):
            session = await _drive(factory)
        session.commit.assert_awaited_once()
        session.close.assert_awaited()
