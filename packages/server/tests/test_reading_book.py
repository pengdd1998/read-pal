"""Tests for reading-book endpoints — generate, get, and list memory books."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from tests.conftest import auth_headers, register_user


def _make_mock_result(book_id: str) -> MagicMock:
    """Build a mock whose model_dump() is synchronous (not a coroutine)."""
    mock_result = MagicMock()
    mock_result.model_dump.return_value = {
        'id': str(uuid4()),
        'book_id': book_id,
        'title': 'My Reading Book',
        'format': 'personal_book',
        'sections': [],
        'stats': {},
        'html_content': None,
        'generated_at': datetime.now(timezone.utc).isoformat(),
    }
    return mock_result


# ---------------------------------------------------------------------------
# POST /api/v1/reading-book/generate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book_id = str(uuid4())

    with patch('app.routers.reading_book.generate', new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = _make_mock_result(book_id)
        resp = await client.post(
            '/api/v1/reading-book/generate',
            headers=headers,
            json={'book_id': book_id},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['book_id'] == book_id
    assert body['data']['title'] == 'My Reading Book'


@pytest.mark.asyncio
async def test_generate_returns_404_for_missing_book(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    with patch('app.routers.reading_book.generate', new_callable=AsyncMock) as mock_gen:
        mock_gen.side_effect = ValueError('Book not found')
        resp = await client.post(
            '/api/v1/reading-book/generate',
            headers=headers,
            json={'book_id': str(uuid4())},
        )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/reading-book/{book_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_memory_book_returns_404_when_not_found(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        f'/api/v1/reading-book/{uuid4()}',
        headers=headers,
    )

    assert resp.status_code == 404
    body = resp.json()
    assert body['detail']['code'] == 'NOT_FOUND'


# ---------------------------------------------------------------------------
# GET /api/v1/reading-book/
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_memory_books_returns_empty_list(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/reading-book/',
        headers=headers,
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data'] == []


@pytest.mark.asyncio
async def test_generate_passes_format_parameter(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book_id = str(uuid4())

    with patch('app.routers.reading_book.generate', new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = _make_mock_result(book_id)
        resp = await client.post(
            '/api/v1/reading-book/generate',
            headers=headers,
            json={'book_id': book_id, 'format': 'scrapbook'},
        )

    assert resp.status_code == 200
    mock_gen.assert_called_once()
    # Positional args: generate(db, user_id, book_id, book_format)
    assert mock_gen.call_args[0][3] == 'scrapbook'


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_returns_401_without_auth(client):
    resp = await client.post(
        '/api/v1/reading-book/generate',
        json={'book_id': str(uuid4())},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_memory_book_returns_401_without_auth(client):
    resp = await client.get(f'/api/v1/reading-book/{uuid4()}')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_memory_books_returns_401_without_auth(client):
    resp = await client.get('/api/v1/reading-book/')
    assert resp.status_code == 401
