"""Integration test fixtures — external PostgreSQL, Redis, MinIO on VPS."""

import os
from collections.abc import AsyncGenerator
from typing import Literal

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db import Base, get_db
from app.main import app

# Integration test mode flag
USE_EXTERNAL_INFRA = os.getenv('TEST_USE_EXTERNAL_INFRA', 'false').lower() == 'true'

# External infrastructure URLs (from env or defaults)
TEST_DATABASE_URL = os.getenv(
    'TEST_DATABASE_URL',
    'postgresql+asyncpg://readpal:changeme@localhost:5432/readpal_test',
)

# Only use this file if external infrastructure is enabled
pytestmark = [
    pytest.mark.skipif(
        not USE_EXTERNAL_INFRA,
        reason='Integration tests require TEST_USE_EXTERNAL_INFRA=true',
    )
]


# ---------------------------------------------------------------------------
# External PostgreSQL engine with test database
# ---------------------------------------------------------------------------

_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
)
_TestSession = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(autouse=True)
async def _setup_db() -> AsyncGenerator[None, None]:
    """Create all tables before each test, drop after (integration mode)."""
    import app.models  # noqa: F401

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    # Clean up test data between tests
    async with _engine.begin() as conn:
        # Truncate all tables (faster than drop/create)
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """HTTP test client with real DB session and Redis (integration mode)."""

    async def _override_get_db():
        async with _TestSession() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db

    # Use real Redis from environment in integration mode
    # The application should already be configured with REDIS_URL from env
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url='http://testserver',
        follow_redirects=True,
    ) as c:
        yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Integration test helpers
# ---------------------------------------------------------------------------

async def cleanup_test_data() -> None:
    """Clean up test data after integration tests."""
    async with _engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
