"""Tests for synthesis endpoints — single book and cross-book synthesis."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import auth_headers, register_user


async def _create_book(client, token, **overrides):
    payload = {
        'title': 'Synthesis Test Book',
        'author': 'Test Author',
        'file_type': 'epub',
        'file_size': 2048,
        'total_pages': 200,
        **overrides,
    }
    resp = await client.post('/api/v1/books', json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()['data']


async def _create_annotation(client, token, book_id, atype='highlight', content='Deep insight about themes'):
    payload = {
        'book_id': book_id,
        'type': atype,
        'location': {'chapter': 1, 'position': 50},
        'content': content,
    }
    resp = await client.post('/api/v1/annotations', json=payload, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()['data']


MOCK_SYNTHESIS = json.dumps({
    'themes': [{'name': 'Identity', 'description': 'Search for self', 'strength': 0.8}],
    'connections': [{'from': 'Identity', 'to': 'Society', 'description': 'Tension'}],
    'timeline': [{'date': '2026-04-01', 'event': 'Started reading', 'significance': 'high'}],
    'insights': [{'insight': 'Key takeaway', 'confidence': 0.9, 'evidence': 'Highlight data'}],
})


def _mock_llm(content: str):
    """Return a mock LLM whose ainvoke returns the given content string."""
    mock_llm = AsyncMock()
    mock_llm.ainvoke = AsyncMock(
        return_value=type('Resp', (), {'content': content})(),
    )
    return mock_llm


# ---------------------------------------------------------------------------
# POST /api/v1/synthesis/{book_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_synthesis(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    with patch('app.services.llm.get_llm', return_value=_mock_llm(MOCK_SYNTHESIS)):
        resp = await client.post(
            f"/api/v1/synthesis/{book['id']}",
            json={'book_id': book['id']},
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'themes' in body['data']


@pytest.mark.asyncio
async def test_synthesis_book_not_found(client):
    reg = await register_user(client)

    mock_llm = AsyncMock()
    with patch('app.services.llm.get_llm', return_value=mock_llm):
        resp = await client.post(
            '/api/v1/synthesis/00000000-0000-0000-0000-000000000000',
            json={'book_id': '00000000-0000-0000-0000-000000000000'},
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_synthesis_unauthenticated(client):
    resp = await client.post(
        '/api/v1/synthesis/00000000-0000-0000-0000-000000000000',
        json={'book_id': '00000000-0000-0000-0000-000000000000'},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/synthesis/cross-book
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cross_book_synthesis(client):
    reg = await register_user(client)
    book1 = await _create_book(client, reg['token'], title='Book A')
    book2 = await _create_book(client, reg['token'], title='Book B')
    await _create_annotation(client, reg['token'], book1['id'])
    await _create_annotation(client, reg['token'], book2['id'])

    mock_response = json.dumps({
        'common_themes': [{'name': 'Common theme', 'description': 'Shared', 'confidence': 0.7}],
        'unique_perspectives': [
            {'title': 'Book A', 'key_takeaway': 'Takeaway A'},
            {'title': 'Book B', 'key_takeaway': 'Takeaway B'},
        ],
        'recommended_connections': ['Book A and Book B share related themes'],
    })

    with patch('app.services.llm.get_llm', return_value=_mock_llm(mock_response)):
        resp = await client.get(
            f"/api/v1/synthesis/cross-book?book_ids={book1['id']},{book2['id']}",
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'common_themes' in body['data']


@pytest.mark.asyncio
async def test_cross_book_synthesis_with_seed_book(client):
    """Cross-book synthesis with just the auto-seeded book should still work."""
    reg = await register_user(client)

    mock_response = json.dumps({
        'common_themes': [{'name': 'American Dream', 'description': 'Central theme', 'confidence': 0.9}],
        'unique_perspectives': [{'title': 'The Great Gatsby', 'key_takeaway': 'Pursuit of dreams'}],
        'recommended_connections': [],
    })

    with patch('app.services.llm.get_llm', return_value=_mock_llm(mock_response)):
        resp = await client.get(
            '/api/v1/synthesis/cross-book',
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'common_themes' in body['data']


# ---------------------------------------------------------------------------
# LLM failure resilience
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_synthesis_llm_failure_returns_fallback(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    mock_llm = AsyncMock()
    mock_llm.ainvoke = AsyncMock(side_effect=Exception('LLM unavailable'))

    with patch('app.services.llm.get_llm', return_value=mock_llm):
        resp = await client.post(
            f"/api/v1/synthesis/{book['id']}",
            json={'book_id': book['id']},
            headers=auth_headers(reg['token']),
        )

    # safe_llm_invoke should catch the error and return fallback
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
