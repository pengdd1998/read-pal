"""Tests for knowledge graph endpoints — graph, concepts, search, themes."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import auth_headers, register_user


async def _create_book(client, token, **overrides):
    payload = {
        'title': 'Knowledge Test Book',
        'author': 'Test Author',
        'file_type': 'epub',
        'file_size': 2048,
        'total_pages': 200,
        **overrides,
    }
    resp = await client.post('/api/v1/books', json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()['data']


async def _create_annotation(client, token, book_id, content='Important concept about resilience'):
    payload = {
        'book_id': book_id,
        'type': 'highlight',
        'location': {'chapter': 1, 'position': 50},
        'content': content,
    }
    resp = await client.post('/api/v1/annotations', json=payload, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()['data']


MOCK_CONCEPTS = json.dumps([
    {'name': 'Resilience', 'type': 'theme', 'related': ['Hope', 'Survival']},
    {'name': 'Hope', 'type': 'concept', 'related': ['Resilience']},
    {'name': 'Gatsby', 'type': 'character', 'related': ['Daisy', 'Green Light']},
])


def _mock_llm_concepts():
    """Return a mock LLM that returns concept extraction results."""
    mock_llm = AsyncMock()
    mock_llm.ainvoke = AsyncMock(
        return_value=type('Resp', (), {'content': MOCK_CONCEPTS})(),
    )
    return mock_llm


# ---------------------------------------------------------------------------
# GET /api/v1/knowledge/graph/{book_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_graph(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    mock_redis = AsyncMock()
    mock_redis.get.return_value = None
    mock_redis.setex.return_value = True

    with (
        patch('app.services.knowledge_service.get_llm', return_value=_mock_llm_concepts()),
        patch('app.services.knowledge_service._get_redis', return_value=mock_redis),
    ):
        resp = await client.get(
            f"/api/v1/knowledge/graph/{book['id']}",
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert len(body['data']['nodes']) >= 2
    assert len(body['data']['edges']) >= 1


@pytest.mark.asyncio
async def test_get_graph_no_annotations(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    mock_redis = AsyncMock()
    mock_redis.get.return_value = None

    with patch('app.services.knowledge_service._get_redis', return_value=mock_redis):
        resp = await client.get(
            f"/api/v1/knowledge/graph/{book['id']}",
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['data']['nodes'] == []
    assert body['data']['edges'] == []


# ---------------------------------------------------------------------------
# GET /api/v1/knowledge/concepts/{book_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_concepts(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    mock_redis = AsyncMock()
    mock_redis.get.return_value = None
    mock_redis.setex.return_value = True

    with (
        patch('app.services.knowledge_service.get_llm', return_value=_mock_llm_concepts()),
        patch('app.services.knowledge_service._get_redis', return_value=mock_redis),
    ):
        resp = await client.get(
            f"/api/v1/knowledge/concepts/{book['id']}",
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert len(body['data']) >= 2
    labels = [c['label'] for c in body['data']]
    assert 'Resilience' in labels


# ---------------------------------------------------------------------------
# GET /api/v1/knowledge/search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_concepts(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    mock_redis = AsyncMock()
    mock_redis.get.return_value = None
    mock_redis.setex.return_value = True

    with (
        patch('app.services.knowledge_service.get_llm', return_value=_mock_llm_concepts()),
        patch('app.services.knowledge_service._get_redis', return_value=mock_redis),
    ):
        resp = await client.get(
            f"/api/v1/knowledge/search?q=resilience&book_id={book['id']}",
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert len(body['data']) >= 1
    assert body['data'][0]['concept'] == 'Resilience'


@pytest.mark.asyncio
async def test_search_concepts_no_match(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    mock_redis = AsyncMock()
    mock_redis.get.return_value = None
    mock_redis.setex.return_value = True

    with (
        patch('app.services.knowledge_service.get_llm', return_value=_mock_llm_concepts()),
        patch('app.services.knowledge_service._get_redis', return_value=mock_redis),
    ):
        resp = await client.get(
            f"/api/v1/knowledge/search?q=nonexistent&book_id={book['id']}",
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    assert resp.json()['data'] == []


# ---------------------------------------------------------------------------
# GET /api/v1/knowledge/graph — All graphs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_all_graphs(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    mock_redis = AsyncMock()
    mock_redis.get.return_value = None

    with patch('app.services.knowledge_service._get_redis', return_value=mock_redis):
        resp = await client.get(
            '/api/v1/knowledge/graph',
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True


# ---------------------------------------------------------------------------
# GET /api/v1/knowledge/themes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_themes(client):
    reg = await register_user(client)

    mock_redis = AsyncMock()
    mock_redis.get.return_value = None

    with patch('app.services.knowledge_service._get_redis', return_value=mock_redis):
        resp = await client.get(
            '/api/v1/knowledge/themes',
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'themes' in body['data']


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_knowledge_unauthenticated(client):
    resp = await client.get('/api/v1/knowledge/graph')
    assert resp.status_code == 401
