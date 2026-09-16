"""P6.1 — derived-stats caches must invalidate on user-data writes.

``GET /api/v1/stats/dashboard`` caches its whole payload (recentBooks,
streak, counts) per user for a full ``cache_data_ttl`` (5m in prod), and
``book_service.get_book_stats`` caches the library-status aggregate the
same way. None of the mutating writes used to drop those keys, so a
deleted book kept rendering as "current reading" on the dashboard until
the TTL expired.

These tests pin the write-path invalidation: every mutation that can
change a derived aggregate must delete both ``stats:dashboard:{uid}``
and ``stats:books:{uid}``. The hermetic-Redis mock (P5.1) records
``delete`` calls, so the assertions run without a real server.
"""

from app.core.redis import get_redis
from tests.conftest import auth_headers, register_user


async def _create_book(client, token: str, title: str = 'The Great Gatsby') -> dict:
    resp = await client.post(
        '/api/v1/books',
        json={
            'title': title,
            'author': 'F. Scott Fitzgerald',
            'file_type': 'epub',
            'file_size': 2048,
            'total_pages': 200,
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, f'Book creation failed: {resp.text}'
    return resp.json()['data']


async def _get_redis_mock():
    """Return the Redis client the app sees under the test patch.

    The ``client`` fixture patches ``redis.asyncio.from_url`` with an
    AsyncMock and ``_reset_inprocess_state`` drops the ``get_redis``
    singleton, so this resolves to the fixture's recording mock.
    """
    return get_redis()


async def test_delete_book_invalidates_derived_caches(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    redis_mock = await _get_redis_mock()
    redis_mock.delete.reset_mock()

    resp = await client.delete(
        f"/api/v1/books/{book['id']}",
        headers=auth_headers(reg['token']),
    )

    assert resp.status_code == 204
    uid = reg['user']['id']
    # SWR: invalidation must clear BOTH the fresh and the stale tier in one DEL
    redis_mock.delete.assert_any_call(
        f'stats:dashboard:{uid}', f'stats:dashboard:{uid}:stale',
    )
    redis_mock.delete.assert_any_call(f'stats:books:{uid}')


async def test_update_book_status_invalidates_derived_caches(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    redis_mock = await _get_redis_mock()
    redis_mock.delete.reset_mock()

    resp = await client.patch(
        f"/api/v1/books/{book['id']}",
        json={'status': 'reading'},
        headers=auth_headers(reg['token']),
    )

    assert resp.status_code == 200
    uid = reg['user']['id']
    # SWR: invalidation must clear BOTH the fresh and the stale tier in one DEL
    redis_mock.delete.assert_any_call(
        f'stats:dashboard:{uid}', f'stats:dashboard:{uid}:stale',
    )
    redis_mock.delete.assert_any_call(f'stats:books:{uid}')


async def test_create_book_invalidates_derived_caches(client):
    reg = await register_user(client)
    redis_mock = await _get_redis_mock()
    redis_mock.delete.reset_mock()

    await _create_book(client, reg['token'])

    uid = reg['user']['id']
    # SWR: invalidation must clear BOTH the fresh and the stale tier in one DEL
    redis_mock.delete.assert_any_call(
        f'stats:dashboard:{uid}', f'stats:dashboard:{uid}:stale',
    )
    redis_mock.delete.assert_any_call(f'stats:books:{uid}')


async def test_create_annotation_invalidates_derived_caches(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    redis_mock = await _get_redis_mock()
    redis_mock.delete.reset_mock()

    resp = await client.post(
        '/api/v1/annotations',
        json={
            'bookId': book['id'],
            'type': 'highlight',
            'content': 'a single green light',
            'location': {'chapter': 1, 'start': 0, 'end': 21},
        },
        headers=auth_headers(reg['token']),
    )

    assert resp.status_code == 201, resp.text
    uid = reg['user']['id']
    # SWR: invalidation must clear BOTH the fresh and the stale tier in one DEL
    redis_mock.delete.assert_any_call(
        f'stats:dashboard:{uid}', f'stats:dashboard:{uid}:stale',
    )
    redis_mock.delete.assert_any_call(f'stats:books:{uid}')
