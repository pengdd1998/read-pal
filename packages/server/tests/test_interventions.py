"""Tests for interventions endpoints — check and feedback."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# POST /api/v1/interventions/check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_returns_success_with_no_sessions(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/interventions/check',
        headers=headers,
        json={},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['interventionNeeded'] is False


@pytest.mark.asyncio
async def test_check_accepts_book_id(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/interventions/check',
        headers=headers,
        json={'bookId': '00000000-0000-0000-0000-000000000001'},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_check_has_required_response_fields(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/interventions/check',
        headers=headers,
        json={},
    )
    body = resp.json()
    data = body['data']
    assert 'interventionNeeded' in data
    assert 'type' in data
    assert 'message' in data
    assert isinstance(data['interventionNeeded'], bool)


# ---------------------------------------------------------------------------
# POST /api/v1/interventions/feedback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_feedback_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/interventions/feedback',
        headers=headers,
        json={
            'type': 'welcome_back',
            'helpful': True,
            'dismissed': False,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['message'] == 'Feedback recorded'


@pytest.mark.asyncio
async def test_feedback_accepts_book_id(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/interventions/feedback',
        headers=headers,
        json={
            'bookId': '00000000-0000-0000-0000-000000000001',
            'type': 'long_session',
            'helpful': False,
            'dismissed': True,
        },
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_feedback_accepts_context(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/interventions/feedback',
        headers=headers,
        json={
            'type': 'marathon',
            'helpful': True,
            'dismissed': False,
            'context': {'session_count': 6, 'total_minutes': 120},
        },
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_returns_401_without_auth(client):
    resp = await client.post('/api/v1/interventions/check', json={})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_feedback_returns_401_without_auth(client):
    resp = await client.post('/api/v1/interventions/feedback', json={})
    assert resp.status_code == 401
