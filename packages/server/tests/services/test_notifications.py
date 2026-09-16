"""Tests for notification endpoints — list, mark read, mark all read."""

import pytest

from tests.conftest import auth_headers, register_user

FAKE_UUID = '99999999-9999-9999-9999-999999999999'


# ---------------------------------------------------------------------------
# GET /api/v1/notifications/ — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_notifications_returns_empty(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/notifications/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    data = body['data']
    assert data['items'] == []
    assert data['total'] == 0
    assert data['page'] == 1
    assert data['perPage'] == 20


@pytest.mark.asyncio
async def test_list_notifications_accepts_query_params(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/notifications/?unread_only=true&page=1&per_page=10',
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()['data']
    assert data['perPage'] == 10


# ---------------------------------------------------------------------------
# PATCH /api/v1/notifications/{id} — mark read/unread
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_notification_read_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.patch(
        f'/api/v1/notifications/{FAKE_UUID}',
        headers=headers,
        json={'read': True},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/v1/notifications/{id}/read — mark read alias
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_read_alias_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.patch(
        f'/api/v1/notifications/{FAKE_UUID}/read',
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/notifications/mark-all-read
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_all_read_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/notifications/mark-all-read',
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'message' in body['data']


# ---------------------------------------------------------------------------
# GET /api/v1/notifications/unread-count
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unread_count_returns_zero(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/notifications/unread-count',
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data'] == 0


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_returns_401_without_auth(client):
    resp = await client.get('/api/v1/notifications/')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mark_read_returns_401_without_auth(client):
    resp = await client.patch(
        f'/api/v1/notifications/{FAKE_UUID}', json={'read': True},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mark_read_alias_returns_401_without_auth(client):
    resp = await client.patch(f'/api/v1/notifications/{FAKE_UUID}/read')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mark_all_read_returns_401_without_auth(client):
    resp = await client.post('/api/v1/notifications/mark-all-read')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unread_count_returns_401_without_auth(client):
    resp = await client.get('/api/v1/notifications/unread-count')
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Service-layer: create_notification + daily-goal dedup + book-completion trigger
# (the notification-creation features wired in round 189)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_notification_persists(client):
    """create_notification adds a row the list endpoint can see."""
    from uuid import UUID
    from app.services.notification_service import create_notification
    from tests.conftest import _TestSession

    reg = await register_user(client)
    uid = UUID(reg['user']['id'])
    async with _TestSession() as db:
        await create_notification(
            db, uid, 'system', 'Test title', 'Test message body',
        )
        await db.commit()

    resp = await client.get('/api/v1/notifications/', headers=auth_headers(reg['token']))
    body = resp.json()['data']
    assert body['total'] == 1
    assert body['items'][0]['title'] == 'Test title'
    assert body['items'][0]['message'] == 'Test message body'


@pytest.mark.asyncio
async def test_daily_goal_notification_fires_once_per_day(client):
    """maybe_notify_daily_goal fires when the goal is met, then dedups."""
    from uuid import UUID
    from app.services.notification_service import maybe_notify_daily_goal
    from tests.conftest import _TestSession

    reg = await register_user(client)
    uid = UUID(reg['user']['id'])

    async with _TestSession() as db:
        await maybe_notify_daily_goal(db, uid, today_minutes=45, daily_goal_minutes=30)
        await db.commit()
    async with _TestSession() as db:
        await maybe_notify_daily_goal(db, uid, today_minutes=50, daily_goal_minutes=30)
        await db.commit()
    # Goal not met → no-op
    async with _TestSession() as db:
        await maybe_notify_daily_goal(db, uid, today_minutes=5, daily_goal_minutes=30)
        await db.commit()

    resp = await client.get('/api/v1/notifications/', headers=auth_headers(reg['token']))
    items = resp.json()['data']['items']
    goal_notifs = [n for n in items if n.get('type') == 'goal_achieved']
    assert len(goal_notifs) == 1, f'expected 1 daily-goal notification, got {len(goal_notifs)}'


@pytest.mark.asyncio
async def test_book_completion_creates_notification(client):
    """Completing a book via PATCH /books fires a book-completed notification."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    # Create a book with 1 page
    book = (await client.post('/api/v1/books', json={
        'title': 'Completion Test', 'author': 'A', 'total_pages': 1, 'file_type': 'epub', 'file_size': 1024,
    }, headers=headers)).json()['data']
    # Move to the last page → completes the book
    resp = await client.patch(f"/api/v1/books/{book['id']}", json={'currentPage': 1}, headers=headers)
    assert resp.status_code == 200

    notifs = (await client.get('/api/v1/notifications/', headers=headers)).json()['data']['items']
    completed = [n for n in notifs if 'finished' in n.get('title', '').lower()]
    assert len(completed) == 1, f'expected a book-completed notification, got {completed}'
