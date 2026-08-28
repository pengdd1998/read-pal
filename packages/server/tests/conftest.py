"""Shared test fixtures — SQLite in-memory DB, authenticated client, mocks.

For integration tests against external infrastructure (PostgreSQL, Redis, MinIO on VPS):
1. Set TEST_USE_EXTERNAL_INFRA=true in environment
2. Configure TEST_DATABASE_URL, TEST_REDIS_URL, TEST_MINIO_* variables
3. Run pytest normally - integration tests will be included
"""

import json
import re
import sqlite3
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import DefaultClause, String, TypeDecorator
from sqlalchemy.types import JSON as _JSON
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db import Base, get_db
from app.main import app
from app.utils.i18n import load_translations

# Load translations once for all tests so t() returns actual strings
load_translations()


class _UuidSafeJSON(TypeDecorator):
    """JSON type that serializes UUID objects to strings for SQLite compat."""

    impl = _JSON
    cache_ok = True

    _UUID_RE = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I,
    )

    def process_bind_param(self, value, dialect):
        if value is not None:
            value = json.loads(json.dumps(value, default=str))
        return value

    def process_result_value(self, value, dialect):
        if isinstance(value, list):
            return [self._maybe_uuid(v) for v in value]
        return value

    @classmethod
    def _maybe_uuid(cls, v):
        if isinstance(v, str) and cls._UUID_RE.match(v):
            return UUID(v)
        return v

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

    try:
        from pgvector.sqlalchemy import Vector as PG_VECTOR
    except ImportError:
        PG_VECTOR = None

    for table in Base.metadata.tables.values():
        for column in table.columns:
            col_type = column.type
            if isinstance(col_type, PG_JSONB):
                column.type = _UuidSafeJSON()
            elif isinstance(col_type, PG_ARRAY):
                column.type = _UuidSafeJSON()
            elif isinstance(col_type, PG_UUID):
                column.type = _UUIDAsString()
            elif PG_VECTOR is not None and isinstance(col_type, PG_VECTOR):
                column.type = _UuidSafeJSON()

            # Replace PostgreSQL server_defaults
            if column.server_default is not None:
                clause = str(column.server_default.arg)
                if 'gen_random_uuid' in clause or 'random()' in clause or 'md5(' in clause:
                    column.server_default = None
                    # Add Python-side default for primary key UUID columns
                    if column.primary_key and column.default is None:
                        from sqlalchemy import ColumnDefault

                        column.default = ColumnDefault(lambda ctx: str(uuid4()))
                elif 'now(' in clause or 'CURRENT_TIMESTAMP' in clause:
                    # func.now() / CURRENT_TIMESTAMP — strip for SQLite, add Python-side fallback
                    column.server_default = None
                    from datetime import datetime, timezone

                    from sqlalchemy import ColumnDefault

                    if column.default is None:
                        column.default = ColumnDefault(
                            lambda ctx: datetime.now(tz=timezone.utc),
                        )
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
    mock_redis.getdel.return_value = None
    mock_redis.exists.return_value = 0
    mock_redis.setex.return_value = True
    mock_redis.set.return_value = True
    mock_redis.delete.return_value = 1
    mock_redis.incr.return_value = 1
    mock_redis.expire.return_value = True
    mock_redis.ttl.return_value = 60

    # Default LLM mock — returns generic JSON to prevent real API calls
    mock_llm = AsyncMock()
    mock_llm.ainvoke = AsyncMock(
        return_value=type('Resp', (), {'content': '{"result": "mocked"}'})()
    )

    # Mock provider registry to prevent real provider initialization
    mock_state = type('ProviderState', (), {
        'config': type('Config', (), {
            'name': 'mock',
            'default_model': 'mock-model',
            'fallback_model': None,
            'api_key': 'test',
            'base_url': 'http://mock',
            'models': {'default': 'mock-model'},
            'priority': 1,
            'cost_weight': 0.5,
            'max_rpm': 0,
        })(),
        'circuit': type('Circuit', (), {
            'is_open': False,
            'allow_request': AsyncMock(return_value=True),
            'record_success': AsyncMock(),
            'record_failure': AsyncMock(),
        })(),
        'pool': {},
        'call_count': 0,
        'window_start': 0.0,
        'avg_latency_ms': 0.0,
        'rpm_available': lambda self: True,
        'increment_rpm': lambda self: None,
        'update_latency': lambda self, *a: None,
    })()

    mock_registry = type('Registry', (), {
        'get_provider': lambda self, feature=None: mock_state,
        'get_provider_by_name': lambda self, name: mock_state,
        'all_providers': lambda self: [mock_state],
        'next_provider_after': lambda self, name: None,
        'record_latency': lambda self, *a: None,
    })()

    with (
        patch('app.middleware._auth_ledger._get_redis', return_value=mock_redis),
        patch('app.services.password_reset_service.get_redis', return_value=mock_redis),
        patch('redis.asyncio.from_url', return_value=mock_redis),
        patch('app.services.llm.get_llm', return_value=mock_llm),
        patch('app.services.llm.registry.get_registry', return_value=mock_registry),
        patch('app.services.upload_service._safe_precompute', new_callable=AsyncMock),
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
    """Return Authorization header dict.

    P0.1 turned ``idempotency_enforce`` on by default. Tests that hit any
    idempotent-protected POST route (agent/chat, friend/chat, synthesis,
    etc.) need a valid ``Idempotency-Key`` or the request fails 422
    before reaching the handler. Including a fresh UUID per call here
    means existing tests keep working without each one having to know
    about idempotency — every call gets a unique key, so no cache
    collisions across the suite.

    Tests that explicitly want to assert missing-key behavior can build
    the dict manually without this helper.
    """
    import uuid as _uuid
    return {
        'Authorization': f'Bearer {token}',
        'Idempotency-Key': _uuid.uuid4().hex,
    }


def mutation_headers(token: str, *, idempotency_key: str | None = None) -> dict[str, str]:
    """Auth headers with an explicit (possibly-reused) Idempotency-Key.

    Use this when a test deliberately reuses a key across calls to verify
    dedup / replay behavior. For ordinary mutations, ``auth_headers`` is
    enough — it already attaches a fresh key.
    """
    import uuid as _uuid
    key = idempotency_key or _uuid.uuid4().hex
    return {
        'Authorization': f'Bearer {token}',
        'Idempotency-Key': key,
    }
