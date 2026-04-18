"""Tests for recommendations endpoint."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# GET /api/v1/recommendations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recommendations_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/recommendations', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert 'recommendations' in body['data']


@pytest.mark.asyncio
async def test_recommendations_returns_five_items_for_new_user(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/recommendations', headers=headers)
    body = resp.json()
    assert len(body['data']['recommendations']) == 5


@pytest.mark.asyncio
async def test_recommendations_has_required_fields(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/recommendations', headers=headers)
    body = resp.json()

    for rec in body['data']['recommendations']:
        assert 'title' in rec
        assert 'author' in rec
        assert 'genre' in rec
        assert 'reason' in rec
        assert 'relevance' in rec
        assert isinstance(rec['relevance'], float)
        assert 0 <= rec['relevance'] <= 1


@pytest.mark.asyncio
async def test_recommendations_exclude_already_read_books(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    # Create a book with a title matching a pool entry
    await client.post(
        '/api/v1/books',
        headers=headers,
        json={
            'title': '1984',
            'author': 'George Orwell',
            'file_type': 'epub',
            'file_size': 1024,
            'total_pages': 200,
        },
    )

    resp = await client.get('/api/v1/recommendations', headers=headers)
    body = resp.json()

    titles = [r['title'] for r in body['data']['recommendations']]
    assert '1984' not in titles


@pytest.mark.asyncio
async def test_recommendations_returns_401_without_auth(client):
    resp = await client.get('/api/v1/recommendations')
    assert resp.status_code == 401
