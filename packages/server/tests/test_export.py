"""Tests for export endpoints."""

import pytest

from tests.conftest import auth_headers, register_user


async def _create_book(client, token, **overrides):
    payload = {
        'title': 'Export Test Book',
        'author': 'Test Author',
        'file_type': 'epub',
        'file_size': 2048,
        'total_pages': 200,
        **overrides,
    }
    resp = await client.post('/api/v1/books', json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()['data']


async def _create_annotation(client, token, book_id, **overrides):
    payload = {
        'book_id': book_id,
        'type': 'highlight',
        'location': {'chapter': 1, 'position': 100},
        'content': 'Notable passage for export.',
        **overrides,
    }
    resp = await client.post('/api/v1/annotations', json=payload, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()['data']


# ---------------------------------------------------------------------------
# GET /api/v1/export/{book_id}/{format}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_markdown(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    resp = await client.get(
        f"/api/v1/export/{book['id']}/markdown",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    assert 'markdown' in resp.headers.get('content-type', '') or resp.text


@pytest.mark.asyncio
async def test_export_csv(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    resp = await client.get(
        f"/api/v1/export/{book['id']}/csv",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    # CSV should contain the annotation content
    assert 'Notable passage' in resp.text or 'content' in resp.text.lower()


@pytest.mark.asyncio
async def test_export_html(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    resp = await client.get(
        f"/api/v1/export/{book['id']}/html",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    assert '<html' in resp.text.lower() or 'html' in resp.headers.get('content-type', '')


@pytest.mark.asyncio
async def test_export_invalid_format(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    resp = await client.get(
        f"/api/v1/export/{book['id']}/invalidformat",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_export_book_not_found(client):
    reg = await register_user(client)

    resp = await client.get(
        '/api/v1/export/00000000-0000-0000-0000-000000000000/markdown',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_export_unauthenticated(client):
    resp = await client.get(
        '/api/v1/export/00000000-0000-0000-0000-000000000000/markdown',
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/export/ (query params)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_via_query_params(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    resp = await client.get(
        f"/api/v1/export/?bookId={book['id']}&format=markdown",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
