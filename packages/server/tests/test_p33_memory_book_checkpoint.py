"""P3.3 tests: Redis-backed section checkpoint for memory_book generation.

Validates the three lifecycle operations:
- ``load_checkpoint`` reads back previously-saved sections
- ``save_section`` upserts a single section into the checkpoint blob
- ``clear_checkpoint`` removes the key

Also covers the failure modes that matter:
- Redis unavailable → graceful degradation (empty dict, no exception)
- Corrupted JSON in Redis → cleared + treated as empty
- Per-(user, book) isolation: a user cannot read another user's checkpoint
- Error sections are checkpointed too (so retries know they were attempted)
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import redis.exceptions

from app.services.memory_book.checkpoint import (
    _CHECKPOINT_TTL_SECONDS,
    _checkpoint_key,
    clear_checkpoint,
    load_checkpoint,
    save_section,
)


class _FakeRedis:
    """In-memory Redis double supporting get/setex/delete.

    Tracks call args so tests can assert on TTL and key scoping.
    """

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.setex_calls: list[tuple[str, int, str]] = []
        self.delete_calls: list[str] = []

    async def get(self, key: str) -> str | None:
        return self.store.get(key)

    async def setex(self, key: str, ttl: int, value: str) -> None:
        self.setex_calls.append((key, ttl, value))
        self.store[key] = value

    async def delete(self, key: str) -> int:
        self.delete_calls.append(key)
        return self.store.pop(key, None) and 1 or 0


@pytest.fixture
def fake_redis() -> _FakeRedis:
    """Patch get_redis to return our in-memory double."""
    fake = _FakeRedis()
    with patch('app.services.memory_book.checkpoint.get_redis', return_value=fake):
        yield fake


# ---------------------------------------------------------------------------
# Key scoping
# ---------------------------------------------------------------------------


def test_checkpoint_key_is_scoped_per_user_and_book():
    """Per-(user, book) isolation: distinct pairs → distinct keys."""
    u1, u2 = uuid4(), uuid4()
    b1, b2 = uuid4(), uuid4()

    assert _checkpoint_key(u1, b1) != _checkpoint_key(u1, b2)
    assert _checkpoint_key(u1, b1) != _checkpoint_key(u2, b1)
    assert _checkpoint_key(u1, b1) != _checkpoint_key(u2, b2)


def test_checkpoint_key_has_stable_prefix():
    """Keys should share a prefix so ops/debug tools can find them."""
    key = _checkpoint_key(uuid4(), uuid4())
    assert key.startswith('mb:ckpt:')


# ---------------------------------------------------------------------------
# load_checkpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_load_returns_empty_when_no_checkpoint(fake_redis: _FakeRedis):
    """First-ever load → empty dict (no prior progress)."""
    result = await load_checkpoint(uuid4(), uuid4())
    assert result == {}


@pytest.mark.asyncio
async def test_load_returns_previously_saved_sections(fake_redis: _FakeRedis):
    """save_section → load_checkpoint round-trip preserves section data."""
    user_id, book_id = uuid4(), uuid4()
    section = {
        'type': 'encounter',
        'title': 'How You Met',
        'content': 'You started reading in January.',
    }
    await save_section(user_id, book_id, 'encounter', section)

    loaded = await load_checkpoint(user_id, book_id)
    assert 'encounter' in loaded
    assert loaded['encounter']['content'] == section['content']


@pytest.mark.asyncio
async def test_load_isolates_users(fake_redis: _FakeRedis):
    """User A cannot read user B's checkpoint — privacy + correctness."""
    user_a, user_b = uuid4(), uuid4()
    book_id = uuid4()

    await save_section(user_a, book_id, 'encounter', {'type': 'encounter', 'content': 'a'})
    b_loaded = await load_checkpoint(user_b, book_id)
    assert b_loaded == {}, 'cross-user leak'


@pytest.mark.asyncio
async def test_load_isolates_books_for_same_user(fake_redis: _FakeRedis):
    """Same user, different book → different checkpoint."""
    user_id = uuid4()
    book_a, book_b = uuid4(), uuid4()

    await save_section(user_id, book_a, 'encounter', {'type': 'encounter', 'content': 'a'})
    b_loaded = await load_checkpoint(user_id, book_b)
    assert b_loaded == {}


@pytest.mark.asyncio
async def test_load_treats_corrupt_json_as_empty_and_clears(fake_redis: _FakeRedis):
    """Garbage blob: clear it and return empty. Don't propagate the corruption."""
    user_id, book_id = uuid4(), uuid4()
    fake_redis.store[_checkpoint_key(user_id, book_id)] = 'not valid json {{{'

    result = await load_checkpoint(user_id, book_id)
    assert result == {}
    # The corrupted key should have been deleted.
    assert _checkpoint_key(user_id, book_id) not in fake_redis.store


@pytest.mark.asyncio
async def test_load_treats_non_dict_json_as_empty(fake_redis: _FakeRedis):
    """JSON that parses to a non-dict (list, string, number) → empty."""
    user_id, book_id = uuid4(), uuid4()
    fake_redis.store[_checkpoint_key(user_id, book_id)] = json.dumps(['not', 'a', 'dict'])
    result = await load_checkpoint(user_id, book_id)
    assert result == {}


@pytest.mark.asyncio
async def test_load_filters_non_dict_section_values(fake_redis: _FakeRedis):
    """A dict-shaped blob with non-dict section values: drop the bad entries.

    Defensive — the JSONB column accepts anything, so we may encounter
    historical rows with weird shapes. Don't crash the pipeline.
    """
    user_id, book_id = uuid4(), uuid4()
    fake_redis.store[_checkpoint_key(user_id, book_id)] = json.dumps({
        'encounter': {'type': 'encounter', 'content': 'good'},
        'bad_string': 'not a dict',
        'bad_list': ['also', 'not', 'a', 'dict'],
    })
    result = await load_checkpoint(user_id, book_id)
    assert set(result.keys()) == {'encounter'}


@pytest.mark.asyncio
async def test_load_returns_empty_when_redis_unavailable():
    """RedisError on read → empty dict, NOT raised. Pipeline degrades gracefully."""
    raising = _raising_redis()
    with patch(
        'app.services.memory_book.checkpoint.get_redis',
        return_value=raising,
    ):
        result = await load_checkpoint(uuid4(), uuid4())
    assert result == {}


def _raising_redis():
    """Return a fake Redis whose async .get/.setex/.delete raise RedisError.

    ``get_redis()`` is sync and returns the Redis instance, so we patch
    it with return_value=<this object>. Each method is an AsyncMock that
    raises to simulate a dead Redis.
    """
    from unittest.mock import MagicMock
    fake = MagicMock()
    fake.get = AsyncMock(side_effect=redis.exceptions.RedisError('connection refused'))
    fake.setex = AsyncMock(side_effect=redis.exceptions.RedisError('connection refused'))
    fake.delete = AsyncMock(side_effect=redis.exceptions.RedisError('connection refused'))
    return fake


# ---------------------------------------------------------------------------
# save_section
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_writes_with_one_hour_ttl(fake_redis: _FakeRedis):
    """TTL is 1 hour — long enough to outlast any LLM call and a restart cycle."""
    user_id, book_id = uuid4(), uuid4()
    await save_section(user_id, book_id, 'encounter', {'type': 'encounter'})

    assert len(fake_redis.setex_calls) == 1
    _, ttl, _ = fake_redis.setex_calls[0]
    assert ttl == _CHECKPOINT_TTL_SECONDS
    assert ttl == 3600


@pytest.mark.asyncio
async def test_save_upserts_into_existing_blob(fake_redis: _FakeRedis):
    """Two saves on the same (user, book) produce ONE blob with BOTH sections."""
    user_id, book_id = uuid4(), uuid4()

    await save_section(user_id, book_id, 'encounter', {'type': 'encounter'})
    await save_section(user_id, book_id, 'highlights', {'type': 'highlights'})

    loaded = await load_checkpoint(user_id, book_id)
    assert set(loaded.keys()) == {'encounter', 'highlights'}


@pytest.mark.asyncio
async def test_save_overwrites_existing_section_on_resave(fake_redis: _FakeRedis):
    """Re-saving the same section_type replaces, not appends."""
    user_id, book_id = uuid4(), uuid4()

    await save_section(user_id, book_id, 'encounter', {'content': 'v1'})
    await save_section(user_id, book_id, 'encounter', {'content': 'v2'})

    loaded = await load_checkpoint(user_id, book_id)
    assert loaded['encounter']['content'] == 'v2'


@pytest.mark.asyncio
async def test_save_persists_error_sections_too(fake_redis: _FakeRedis):
    """Sections with an 'error' key are still checkpointed.

    Why: the next pipeline run uses the checkpoint to know "was this
    section attempted?" An error stub is the answer "yes, but failed" —
    which is different from "never attempted" and triggers retry.
    """
    user_id, book_id = uuid4(), uuid4()
    error_section = {'type': 'highlights', 'error': 'Generation failed'}

    await save_section(user_id, book_id, 'highlights', error_section)

    loaded = await load_checkpoint(user_id, book_id)
    assert loaded['highlights'] == error_section


@pytest.mark.asyncio
async def test_save_does_not_raise_when_redis_unavailable():
    """RedisError on save → swallow, log, return None. Never crash the pipeline."""
    with patch(
        'app.services.memory_book.checkpoint.get_redis',
        return_value=_raising_redis(),
    ):
        # Should not raise.
        await save_section(uuid4(), uuid4(), 'encounter', {'type': 'encounter'})


# ---------------------------------------------------------------------------
# clear_checkpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clear_removes_checkpoint_key(fake_redis: _FakeRedis):
    """After clear, subsequent load returns empty."""
    user_id, book_id = uuid4(), uuid4()
    await save_section(user_id, book_id, 'encounter', {'type': 'encounter'})

    await clear_checkpoint(user_id, book_id)

    assert await load_checkpoint(user_id, book_id) == {}
    assert _checkpoint_key(user_id, book_id) not in fake_redis.store


@pytest.mark.asyncio
async def test_clear_is_idempotent(fake_redis: _FakeRedis):
    """Clearing an already-empty checkpoint is a no-op (delete on missing key)."""
    user_id, book_id = uuid4(), uuid4()
    # No prior save. Clear should still succeed.
    await clear_checkpoint(user_id, book_id)
    assert _checkpoint_key(user_id, book_id) not in fake_redis.store


@pytest.mark.asyncio
async def test_clear_only_affects_target_user_book(fake_redis: _FakeRedis):
    """Clearing one (user, book) doesn't touch another."""
    user_id = uuid4()
    book_a, book_b = uuid4(), uuid4()

    await save_section(user_id, book_a, 'encounter', {'type': 'encounter'})
    await save_section(user_id, book_b, 'encounter', {'type': 'encounter'})

    await clear_checkpoint(user_id, book_a)

    assert await load_checkpoint(user_id, book_a) == {}
    assert await load_checkpoint(user_id, book_b) != {}


@pytest.mark.asyncio
async def test_clear_does_not_raise_when_redis_unavailable():
    """RedisError on clear → swallow, log, return None."""
    with patch(
        'app.services.memory_book.checkpoint.get_redis',
        return_value=_raising_redis(),
    ):
        await clear_checkpoint(uuid4(), uuid4())


# ---------------------------------------------------------------------------
# Integration: round-trip multiple sections
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_round_trip_five_sections_preserves_all(fake_redis: _FakeRedis):
    """Save 5 distinct sections, load them all back, verify contents intact.

    This is the core resume-after-crash scenario: a worker that died
    after 5/10 sections completed should be able to read those 5 back
    and skip the corresponding LLM calls on restart.
    """
    user_id, book_id = uuid4(), uuid4()
    sections: dict[str, dict[str, Any]] = {
        'encounter': {'type': 'encounter', 'title': 'A', 'content': 'a' * 50},
        'highlights': {'type': 'highlights', 'title': 'B', 'content': 'b' * 50},
        'conversations': {'type': 'conversations', 'title': 'C', 'content': 'c' * 50},
        'attention_map': {'type': 'attention_map', 'title': 'D', 'content': 'd' * 50},
        'what_stuck': {'type': 'what_stuck', 'title': 'E', 'content': 'e' * 50},
    }
    for st, data in sections.items():
        await save_section(user_id, book_id, st, data)

    loaded = await load_checkpoint(user_id, book_id)
    assert set(loaded.keys()) == set(sections.keys())
    for st, data in sections.items():
        assert loaded[st] == data
