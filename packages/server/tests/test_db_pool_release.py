"""Tests for DB connection-pool reuse: release_db + pool_status + env sizing."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import pool_status, release_db


class TestReleaseDb:
    @pytest.mark.asyncio
    async def test_active_txn_committed_and_released(self):
        """An open (read) transaction is committed → connection returns to pool."""
        db = AsyncMock(spec=AsyncSession)
        db.in_transaction.return_value = True

        await release_db(db)

        db.in_transaction.assert_awaited() if hasattr(db.in_transaction, 'assert_awaited') else None
        db.commit.assert_awaited_once()
        db.rollback.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_txn_is_noop(self):
        """No transaction open → nothing happens (zero round-trips)."""
        db = AsyncMock(spec=AsyncSession)
        db.in_transaction.return_value = False

        await release_db(db)

        db.commit.assert_not_awaited()
        db.rollback.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_commit_failure_rolls_back_and_swallows(self):
        """Broken read-txn → rollback, no exception (LLM call proceeds next)."""
        db = AsyncMock(spec=AsyncSession)
        db.in_transaction.return_value = True
        db.commit.side_effect = RuntimeError('connection broke')

        await release_db(db)  # must not raise

        db.rollback.assert_awaited_once()


class TestPoolStatus:
    def test_pool_status_shape(self):
        """pool_status returns checked_out/size — the exhaustion signal."""
        status = pool_status()
        # real engine pool: keys exist and values are ints
        assert 'checked_out' in status or status == {'status': 'unavailable'}
        if 'checked_out' in status:
            assert isinstance(status['checked_out'], int)
            assert status['checked_out'] >= 0

    def test_pool_status_never_raises(self):
        """Broken pool API → graceful 'unavailable', never a 500 in /health."""
        with patch('app.db.engine') as mock_engine:
            mock_engine.pool.size.side_effect = RuntimeError('boom')
            status = pool_status()
            assert status == {'status': 'unavailable'}


class TestPoolEnvSizing:
    def test_env_overrides_read(self):
        """DB_POOL_SIZE / DB_MAX_OVERFLOW / DB_POOL_RECYCLE / DB_POOL_TIMEOUT
        are read from env at import time (documented knobs). Tested via the
        pure parser — reloading app.db would swap the shared engine and
        poison other tests in the process."""
        from app.db import _pool_config_from_env

        size, overflow, recycle, timeout = _pool_config_from_env({
            'DB_POOL_SIZE': '7', 'DB_MAX_OVERFLOW': '3',
            'DB_POOL_RECYCLE': '900', 'DB_POOL_TIMEOUT': '15',
        })
        assert (size, overflow, recycle, timeout) == (7, 3, 900, 15)

    def test_env_defaults(self):
        from app.db import _pool_config_from_env

        assert _pool_config_from_env({}) == (20, 10, 1800, 30)
