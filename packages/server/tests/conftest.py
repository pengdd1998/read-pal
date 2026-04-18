"""Shared test fixtures — SQLite in-memory DB, authenticated client, mocks."""

import sqlite3
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import DefaultClause, JSON, String, TypeDecorator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db import Base, get_db
from app.main import app

# ---------------------------------------------------------------------------
# SQLite in-memory engine with PostgreSQL-type compatibility
# ---------------------------------------------------------------------------

# Shared-cache in-memory DB so all sessions see the same data
TEST_DATABASE_URL = 'sqlite+aiosqlite:///file:readpal_test?mode=memory&cache=shared&uri=true'

# Register UUID adapter so sqlite3 can persist Python UUID objects
sqlite3.register_adapter(UUID, lambda u: str(u))

_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
    connect_args={'check_same_thread': False},
)
_TestSession = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


class _UUIDAsString(TypeDecorator):
    """UUID type that stores as string and auto-converts UUID objects."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        return value  # keep as string; Pydantic handles UUID conversion


def _patch_metadata_for_sqlite():
    """Replace PostgreSQL-specific column types and defaults with SQLite-compatible ones."""
    import re

    from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
    from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
    from sqlalchemy.dialects.postgresql import UUID as PG_UUID

    for table in Base.metadata.tables.values():
        for column in table.columns:
            col_type = column.type
            if isinstance(col_type, PG_JSONB):
                column.type = JSON()
            elif isinstance(col_type, PG_ARRAY):
                column.type = JSON()
            elif isinstance(col_type, PG_UUID):
                column.type = _UUIDAsString()

            # Replace PostgreSQL server_defaults
            if column.server_default is not None:
                clause = str(column.server_default.arg)
                if 'gen_random_uuid' in clause or 'random()' in clause or 'md5(' in clause:
                    column.server_default = None
                elif '::' in clause:
                    clean = re.sub(r'::[\w]+\b', '', clause)
                    column.server_default = DefaultClause(clean)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def _setup_db() -> AsyncGenerator[None, None]:
    """Create all tables before each test, drop after."""
    import app.models  # noqa: F401

    _patch_metadata_for_sqlite()

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """HTTP test client with fresh DB session per request and Redis mocked."""

    async def _override_get_db():
        async with _TestSession() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db

    # Mock Redis so token blacklist / rate limiting doesn't need a real instance
    mock_redis = AsyncMock()
    mock_redis.get.return_value = None
    mock_redis.exists.return_value = 0
    mock_redis.setex.return_value = True
    mock_redis.set.return_value = True
    mock_redis.delete.return_value = 1
    mock_redis.incr.return_value = 1
    mock_redis.expire.return_value = True
    mock_redis.ttl.return_value = 60

    with (
        patch('app.middleware.auth._get_redis', return_value=mock_redis),
        patch('app.routers.password_reset._get_redis', return_value=mock_redis),
        patch('redis.asyncio.from_url', return_value=mock_redis),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url='http://testserver',
            follow_redirects=True,
        ) as c:
            yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def register_user(
    client: AsyncClient,
    email: str = 'test@example.com',
    password: str = 'TestPass123!',
    name: str = 'Test User',
) -> dict:
    """Register a user via the API and return the response JSON."""
    resp = await client.post(
        '/api/v1/auth/register',
        json={'email': email, 'password': password, 'name': name, 'confirmPassword': password},
    )
    assert resp.status_code == 201, f'Registration failed: {resp.text}'
    body = resp.json()
    return body['data']


def auth_headers(token: str) -> dict[str, str]:
    """Return Authorization header dict."""
    return {'Authorization': f'Bearer {token}'}
