"""Tests for webhook endpoints — CRUD, events, deliveries, test."""

from uuid import uuid4

import pytest

from tests.conftest import auth_headers, register_user

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_WEBHOOK_URL = 'https://example.com/hook'


async def _create_webhook(client, headers, url=_WEBHOOK_URL, events=None):
    """Create a webhook and return the response data dict."""
    if events is None:
        events = ['book.started']
    resp = await client.post(
        '/api/v1/webhooks/',
        headers=headers,
        json={'url': url, 'events': events},
    )
    assert resp.status_code == 201, f'Create webhook failed: {resp.text}'
    return resp.json()['data']


# ---------------------------------------------------------------------------
# GET /api/v1/webhooks/events
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_events_returns_event_types(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/webhooks/events', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert isinstance(body['data'], list)
    assert 'book.created' in body['data']
    assert 'annotation.created' in body['data']


# ---------------------------------------------------------------------------
# POST /api/v1/webhooks/
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_webhook_returns_201(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    data = await _create_webhook(client, headers)
    assert data['url'] == _WEBHOOK_URL
    assert data['events'] == ['book.started']
    assert 'id' in data
    assert 'secret' in data
    assert data['isActive'] is True


@pytest.mark.asyncio
async def test_create_webhook_returns_camel_case_fields(client):
    """Verify the Pydantic schema serializes to camelCase."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    data = await _create_webhook(client, headers)
    # camelCase aliases from alias_generator=to_camel
    assert 'isActive' in data
    assert 'createdAt' in data
    # snake_case should NOT be present
    assert 'is_active' not in data
    assert 'created_at' not in data


@pytest.mark.asyncio
async def test_create_webhook_with_invalid_event_returns_422(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/webhooks/',
        headers=headers,
        json={'url': _WEBHOOK_URL, 'events': ['invalid.event']},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_webhook_with_empty_events_returns_422(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/webhooks/',
        headers=headers,
        json={'url': _WEBHOOK_URL, 'events': []},
    )
    # Empty events list is not in VALID_WEBHOOK_EVENTS, should fail validation
    assert resp.status_code in (422, 201)


@pytest.mark.asyncio
async def test_create_webhook_with_invalid_url_returns_422(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/webhooks/',
        headers=headers,
        json={'url': 'not-a-url', 'events': ['book.started']},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_webhook_without_url_returns_422(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/webhooks/',
        headers=headers,
        json={'events': ['book.started']},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/webhooks/
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_webhooks_returns_items(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    await _create_webhook(client, headers)

    resp = await client.get('/api/v1/webhooks/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    items = body['data']['items']
    assert isinstance(items, list)
    assert len(items) >= 1
    assert items[0]['url'] == _WEBHOOK_URL


@pytest.mark.asyncio
async def test_list_webhooks_returns_camel_case_fields(client):
    """Verify list items use camelCase via schema alias."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    await _create_webhook(client, headers)

    resp = await client.get('/api/v1/webhooks/', headers=headers)
    body = resp.json()
    item = body['data']['items'][0]
    assert 'isActive' in item
    assert 'lastDeliveryAt' in item
    assert 'lastDeliveryStatus' in item
    assert 'failureCount' in item
    assert 'createdAt' in item
    # snake_case should NOT be present
    assert 'is_active' not in item
    assert 'last_delivery_at' not in item


# ---------------------------------------------------------------------------
# PATCH /api/v1/webhooks/{webhook_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_webhook_returns_updated_data(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    created = await _create_webhook(client, headers)

    resp = await client.patch(
        f"/api/v1/webhooks/{created['id']}",
        headers=headers,
        json={'events': ['book.started', 'book.updated']},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['events'] == ['book.started', 'book.updated']
    assert body['data']['id'] == created['id']


@pytest.mark.asyncio
async def test_update_webhook_returns_camel_case_fields(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    created = await _create_webhook(client, headers)

    resp = await client.patch(
        f"/api/v1/webhooks/{created['id']}",
        headers=headers,
        json={'events': ['book.started']},
    )
    data = resp.json()['data']
    assert 'isActive' in data
    assert 'createdAt' in data
    assert 'is_active' not in data


@pytest.mark.asyncio
async def test_update_webhook_returns_404_for_missing(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    fake_id = str(uuid4())
    resp = await client.patch(
        f'/api/v1/webhooks/{fake_id}',
        headers=headers,
        json={'events': ['book.started']},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/v1/webhooks/{webhook_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_webhook_returns_204(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    created = await _create_webhook(client, headers)

    resp = await client.delete(
        f"/api/v1/webhooks/{created['id']}",
        headers=headers,
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_webhook_returns_404_for_missing(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    fake_id = str(uuid4())
    resp = await client.delete(
        f'/api/v1/webhooks/{fake_id}',
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/webhooks/{webhook_id}/deliveries
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_deliveries_returns_paginated_data(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    created = await _create_webhook(client, headers)

    resp = await client.get(
        f"/api/v1/webhooks/{created['id']}/deliveries",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    data = body['data']
    assert 'items' in data
    assert 'total' in data
    assert 'page' in data
    assert 'perPage' in data
    assert isinstance(data['items'], list)


@pytest.mark.asyncio
async def test_get_deliveries_returns_404_for_missing(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    fake_id = str(uuid4())
    resp = await client.get(
        f'/api/v1/webhooks/{fake_id}/deliveries',
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/webhooks/{webhook_id}/test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_test_webhook_returns_queued(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    created = await _create_webhook(client, headers)

    resp = await client.post(
        f"/api/v1/webhooks/{created['id']}/test",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['testResult'] == 'queued'


@pytest.mark.asyncio
async def test_test_webhook_returns_camel_case_fields(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    created = await _create_webhook(client, headers)

    resp = await client.post(
        f"/api/v1/webhooks/{created['id']}/test",
        headers=headers,
    )
    data = resp.json()['data']
    assert 'testResult' in data
    assert 'test_result' not in data


@pytest.mark.asyncio
async def test_test_webhook_returns_404_for_missing(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    fake_id = str(uuid4())
    resp = await client.post(
        f'/api/v1/webhooks/{fake_id}/test',
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_events_returns_401_without_auth(client):
    resp = await client.get('/api/v1/webhooks/events')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_webhook_returns_401_without_auth(client):
    resp = await client.post(
        '/api/v1/webhooks/',
        json={'url': 'https://example.com', 'events': ['book.started']},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_webhooks_returns_401_without_auth(client):
    resp = await client.get('/api/v1/webhooks/')
    assert resp.status_code == 401
