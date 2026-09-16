"""Tests for AI companion (agent) endpoints.

GLM calls are mocked to avoid external API dependencies.
"""

from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import auth_headers, register_user


async def _create_book(client, token, **overrides):
    payload = {
        'title': 'The Great Gatsby',
        'author': 'F. Scott Fitzgerald',
        'file_type': 'epub',
        'file_size': 2048,
        'total_pages': 180,
        **overrides,
    }
    resp = await client.post('/api/v1/books', json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()['data']


def _mock_llm_response():
    """Return a mock that behaves like an LLM response with .content."""
    mock = AsyncMock()
    mock.content = 'This is a mock AI response about the book.'
    return mock


# ---------------------------------------------------------------------------
# POST /api/v1/agent/chat
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_chat(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    mock_response = _mock_llm_response()
    with patch('app.services.llm.get_llm') as mock_get_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = mock_response
        mock_get_llm.return_value = mock_llm

        resp = await client.post(
            '/api/v1/agent/chat',
            json={'book_id': book['id'], 'message': 'What is this book about?'},
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is True
    assert 'data' in data


@pytest.mark.asyncio
async def test_agent_chat_unauthenticated(client):
    resp = await client.post('/api/v1/agent/chat', json={
        'book_id': '00000000-0000-0000-0000-000000000000',
        'message': 'Hello',
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_agent_chat_missing_message(client):
    reg = await register_user(client)
    resp = await client.post(
        '/api/v1/agent/chat',
        json={'book_id': '00000000-0000-0000-0000-000000000000', 'message': ''},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/agent/history
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_history(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    # Send a chat first (with mocked LLM)
    mock_response = _mock_llm_response()
    with patch('app.services.llm.get_llm') as mock_get_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = mock_response
        mock_get_llm.return_value = mock_llm

        await client.post(
            '/api/v1/agent/chat',
            json={'book_id': book['id'], 'message': 'Hello'},
            headers=auth_headers(reg['token']),
        )

    # Now fetch history
    resp = await client.get(
        f"/api/v1/agent/history?book_id={book['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is True
    assert isinstance(data['data'], list)


@pytest.mark.asyncio
async def test_agent_history_empty(client):
    reg = await register_user(client)
    resp = await client.get(
        '/api/v1/agent/history',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is True
    assert isinstance(data['data'], list)


# ---------------------------------------------------------------------------
# POST /api/v1/agent/explain
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_explain(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    mock_response = _mock_llm_response()
    with patch('app.services.llm.get_llm') as mock_get_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = mock_response
        mock_get_llm.return_value = mock_llm

        resp = await client.post(
            '/api/v1/agent/explain',
            json={'book_id': book['id'], 'text': 'So we beat on, boats against the current'},
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is True


# ---------------------------------------------------------------------------
# POST /api/v1/agent/summarize
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_summarize(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    mock_response = _mock_llm_response()
    with patch('app.services.llm.get_llm') as mock_get_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = mock_response
        mock_get_llm.return_value = mock_llm

        resp = await client.post(
            '/api/v1/agent/summarize',
            json={'book_id': book['id']},
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is True


# ---------------------------------------------------------------------------
# POST /api/v1/agent/mood/scene
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_mood_scene(client):
    reg = await register_user(client)

    mock_response = _mock_llm_response()
    # Mood scene needs JSON-parseable response
    mock_response.content = '{"mood": "happy", "scene": "A sunny day", "suggestion": "Read outside", "color": "#FFD700"}'
    with patch('app.services.llm.get_llm') as mock_get_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = mock_response
        mock_get_llm.return_value = mock_llm

        resp = await client.post(
            '/api/v1/agent/mood/scene',
            json={'mood': 'happy'},
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is True
