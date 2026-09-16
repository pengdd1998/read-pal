"""Tests for study mode endpoints — objectives, concept checks, mastery."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_book(client, headers, title='Test Book', author='Author'):
    """Create a book and return the response JSON."""
    resp = await client.post(
        '/api/v1/books',
        headers=headers,
        json={
            'title': title,
            'author': author,
            'file_type': 'epub',
            'file_size': 1024,
            'total_pages': 200,
        },
    )
    assert resp.status_code == 201, f'Book creation failed: {resp.text}'
    return resp.json()['data']


# ---------------------------------------------------------------------------
# POST /api/v1/study-mode/objectives
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_objectives_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/study-mode/objectives',
        headers=headers,
        json={
            'bookId': '00000000-0000-0000-0000-000000000001',
            'chapterIndex': 1,
            'chapterTitle': 'Introduction',
        },
    )
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert 'objectives' in body['data']
    assert len(body['data']['objectives']) >= 1

    # Each objective has required fields
    for obj in body['data']['objectives']:
        assert 'id' in obj
        assert 'text' in obj
        assert 'completed' in obj


@pytest.mark.asyncio
async def test_objectives_returns_generic_on_empty_body(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/study-mode/objectives',
        headers=headers,
        json={},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert len(body['data']['objectives']) >= 3


# ---------------------------------------------------------------------------
# POST /api/v1/study-mode/concept-checks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concept_checks_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/study-mode/concept-checks',
        headers=headers,
        json={
            'bookId': '00000000-0000-0000-0000-000000000001',
            'chapterIndex': 2,
            'chapterTitle': 'Basics',
            'chapterContent': 'This chapter covers basic concepts.',
            'objectives': ['Learn basics'],
        },
    )
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert 'checks' in body['data']
    assert len(body['data']['checks']) >= 1

    for check in body['data']['checks']:
        assert 'id' in check
        assert 'question' in check
        assert 'hint' in check
        assert 'answer' in check
        assert 'position' in check
        assert check['position'] in ('start', 'middle', 'end')


# ---------------------------------------------------------------------------
# POST /api/v1/study-mode/save-checks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_checks_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, headers)

    resp = await client.post(
        '/api/v1/study-mode/save-checks',
        headers=headers,
        json={
            'bookId': book['id'],
            'checks': [
                {
                    'id': '00000000-0000-0000-0000-000000000001',
                    'question': 'What is X?',
                    'hint': 'Think about Y',
                    'answer': 'X is Y',
                    'position': 'start',
                },
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True


@pytest.mark.asyncio
async def test_save_checks_creates_flashcards(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, headers)

    # Save checks
    await client.post(
        '/api/v1/study-mode/save-checks',
        headers=headers,
        json={
            'bookId': book['id'],
            'checks': [
                {
                    'id': '00000000-0000-0000-0000-000000000001',
                    'question': 'Q1?',
                    'hint': 'H1',
                    'answer': 'A1',
                    'position': 'start',
                },
                {
                    'id': '00000000-0000-0000-0000-000000000002',
                    'question': 'Q2?',
                    'hint': 'H2',
                    'answer': 'A2',
                    'position': 'end',
                },
            ],
        },
    )

    # Verify flashcards were created
    fc_resp = await client.get(
        f'/api/v1/flashcards?book_id={book["id"]}',
        headers=headers,
    )
    assert fc_resp.status_code == 200
    fc_body = fc_resp.json()
    assert fc_body['data']['total'] >= 2


@pytest.mark.asyncio
async def test_save_checks_handles_empty(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/study-mode/save-checks',
        headers=headers,
        json={},
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# GET /api/v1/study-mode/mastery/{bookId}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mastery_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, headers)

    resp = await client.get(
        f'/api/v1/study-mode/mastery/{book["id"]}',
        headers=headers,
    )
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True

    data = body['data']
    assert data['bookId'] == book['id']
    assert isinstance(data['chaptersCompleted'], int)
    assert isinstance(data['totalChapters'], int)
    assert isinstance(data['overallMastery'], float)
    assert isinstance(data['weakAreas'], list)
    assert isinstance(data['strongAreas'], list)
    assert isinstance(data['cardsDue'], int)


@pytest.mark.asyncio
async def test_mastery_returns_zeros_for_unknown_book(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    fake_id = '00000000-0000-0000-0000-000000000099'
    resp = await client.get(
        f'/api/v1/study-mode/mastery/{fake_id}',
        headers=headers,
    )
    assert resp.status_code == 200

    data = resp.json()['data']
    assert data['chaptersCompleted'] == 0
    assert data['overallMastery'] == 0.0


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_objectives_returns_401_without_auth(client):
    resp = await client.post(
        '/api/v1/study-mode/objectives',
        json={},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_concept_checks_returns_401_without_auth(client):
    resp = await client.post(
        '/api/v1/study-mode/concept-checks',
        json={},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_save_checks_returns_401_without_auth(client):
    resp = await client.post(
        '/api/v1/study-mode/save-checks',
        json={},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mastery_returns_401_without_auth(client):
    resp = await client.get(
        '/api/v1/study-mode/mastery/00000000-0000-0000-0000-000000000001',
    )
    assert resp.status_code == 401
