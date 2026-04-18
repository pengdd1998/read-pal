"""Tests for challenges endpoint."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# GET /api/v1/challenges
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_challenges_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/challenges', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert 'challenges' in body['data']


@pytest.mark.asyncio
async def test_challenges_returns_six_challenges(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/challenges', headers=headers)
    body = resp.json()
    assert len(body['data']['challenges']) == 6


@pytest.mark.asyncio
async def test_challenges_has_required_fields(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/challenges', headers=headers)
    body = resp.json()

    for ch in body['data']['challenges']:
        assert 'id' in ch
        assert 'title' in ch
        assert 'description' in ch
        assert 'type' in ch
        assert ch['type'] in ('daily', 'weekly', 'monthly')
        assert 'target' in ch
        assert 'unit' in ch
        assert 'icon' in ch
        assert 'progress' in ch
        assert 'completed' in ch
        assert 'percentage' in ch
        assert isinstance(ch['completed'], bool)


@pytest.mark.asyncio
async def test_challenges_has_expected_ids(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/challenges', headers=headers)
    body = resp.json()

    ids = {ch['id'] for ch in body['data']['challenges']}
    expected = {
        'daily-reading',
        'weekly-pages',
        'highlight-streak',
        'book-completion',
        'flashcard-review',
        'monthly-books',
    }
    assert ids == expected


@pytest.mark.asyncio
async def test_challenges_returns_401_without_auth(client):
    resp = await client.get('/api/v1/challenges')
    assert resp.status_code == 401
