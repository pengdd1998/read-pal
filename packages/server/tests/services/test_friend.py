"""Tests for friend endpoints — chat and relationship."""

from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# POST /api/v1/friend/chat
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_chat_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    with patch('app.routers.friend.friend_service.chat', new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = {
            'role': 'assistant',
            'content': 'Hello! How can I help your reading today?',
        }
        resp = await client.post(
            '/api/v1/friend/chat',
            headers=headers,
            json={'message': 'Hi there!', 'persona': 'sage'},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'data' in body
    assert body['data']['role'] == 'assistant'
    assert 'content' in body['data']


@pytest.mark.asyncio
async def test_chat_passes_persona(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    with patch('app.routers.friend.friend_service.chat', new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = {
            'role': 'assistant',
            'content': 'Hey! Alex here!',
        }
        resp = await client.post(
            '/api/v1/friend/chat',
            headers=headers,
            json={'message': 'Hello!', 'persona': 'alex'},
        )

    assert resp.status_code == 200
    mock_chat.assert_called_once()
    call_kwargs = mock_chat.call_args
    assert call_kwargs.kwargs.get('persona') == 'alex' or call_kwargs[1].get('persona') == 'alex'


# ---------------------------------------------------------------------------
# GET /api/v1/friend/relationship
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_relationship_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    with patch(
        'app.routers.friend.friend_service.get_relationship',
        new_callable=AsyncMock,
    ) as mock_rel:
        mock_rel.return_value = {'level': 1, 'xp': 0, 'title': 'New Friend'}
        resp = await client.get(
            '/api/v1/friend/relationship',
            headers=headers,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['level'] == 1
    assert body['data']['title'] == 'New Friend'


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_chat_returns_401_without_auth(client):
    resp = await client.post(
        '/api/v1/friend/chat',
        json={'message': 'Hello!', 'persona': 'sage'},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_relationship_returns_401_without_auth(client):
    resp = await client.get('/api/v1/friend/relationship')
    assert resp.status_code == 401
