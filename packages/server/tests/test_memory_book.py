"""Tests for memory book (Personal Reading Book) endpoints."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import auth_headers, register_user


async def _create_book(client, token, **overrides):
    payload = {
        'title': 'Memory Book Test',
        'author': 'Test Author',
        'file_type': 'epub',
        'file_size': 2048,
        'total_pages': 200,
        **overrides,
    }
    resp = await client.post('/api/v1/books', json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()['data']


async def _create_annotation(client, token, book_id, atype='highlight', content='Test highlight'):
    payload = {
        'book_id': book_id,
        'type': atype,
        'location': {'chapter': 1, 'position': 50},
        'content': content,
    }
    resp = await client.post('/api/v1/annotations', json=payload, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()['data']


def _mock_llm_chapter_response(chapter_num):
    """Return a predictable mock chapter response."""
    return json.dumps({
        'chapter': chapter_num,
        'title': f'Chapter {chapter_num} Title',
        'data': f'Mock content for chapter {chapter_num}',
    })


# ---------------------------------------------------------------------------
# POST /api/v1/reading-book/generate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_memory_book(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    mock_llm = AsyncMock()
    mock_llm.ainvoke = AsyncMock(side_effect=[
        type('Resp', (), {'content': _mock_llm_chapter_response(i)})()
        for i in range(1, 7)
    ])

    with patch('app.services.llm.get_llm', return_value=mock_llm):
        resp = await client.post(
            '/api/v1/reading-book/generate',
            json={'book_id': book['id'], 'format': 'personal_book'},
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'htmlContent' in body['data']
    assert '<html' in body['data']['htmlContent'].lower()
    assert body['data']['format'] == 'personal_book'


@pytest.mark.asyncio
async def test_generate_memory_book_not_found(client):
    reg = await register_user(client)

    mock_llm = AsyncMock()
    with patch('app.services.llm.get_llm', return_value=mock_llm):
        resp = await client.post(
            '/api/v1/reading-book/generate',
            json={'book_id': '00000000-0000-0000-0000-000000000000'},
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_generate_memory_book_unauthenticated(client):
    resp = await client.post(
        '/api/v1/reading-book/generate',
        json={'book_id': '00000000-0000-0000-0000-000000000000'},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/reading-book/{book_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_memory_book(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    mock_llm = AsyncMock()
    mock_llm.ainvoke = AsyncMock(side_effect=[
        type('Resp', (), {'content': _mock_llm_chapter_response(i)})()
        for i in range(1, 7)
    ])

    with patch('app.services.llm.get_llm', return_value=mock_llm):
        await client.post(
            '/api/v1/reading-book/generate',
            json={'book_id': book['id'], 'format': 'personal_book'},
            headers=auth_headers(reg['token']),
        )

    # Now fetch it
    resp = await client.get(
        f"/api/v1/reading-book/{book['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['title'] is not None


@pytest.mark.asyncio
async def test_get_memory_book_not_generated(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    resp = await client.get(
        f"/api/v1/reading-book/{book['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/reading-book — List all
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_memory_books_empty(client):
    reg = await register_user(client)

    resp = await client.get(
        '/api/v1/reading-book',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data'] == []


@pytest.mark.asyncio
async def test_list_memory_books_with_data(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    mock_llm = AsyncMock()
    mock_llm.ainvoke = AsyncMock(side_effect=[
        type('Resp', (), {'content': _mock_llm_chapter_response(i)})()
        for i in range(1, 7)
    ])

    with patch('app.services.llm.get_llm', return_value=mock_llm):
        await client.post(
            '/api/v1/reading-book/generate',
            json={'book_id': book['id'], 'format': 'personal_book'},
            headers=auth_headers(reg['token']),
        )

    resp = await client.get(
        '/api/v1/reading-book',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert len(body['data']) >= 1
