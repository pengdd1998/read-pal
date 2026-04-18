"""Tests for flashcard endpoints — CRUD, SM-2 review, due cards, decks."""

import pytest

from tests.conftest import auth_headers, register_user


async def _create_book(client, token, **overrides):
    payload = {
        'title': 'Flashcard Test Book',
        'author': 'Test Author',
        'file_type': 'epub',
        'file_size': 2048,
        'total_pages': 200,
        **overrides,
    }
    resp = await client.post('/api/v1/books', json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()['data']


async def _create_flashcard(client, token, book_id, **overrides):
    payload = {
        'book_id': book_id,
        'question': 'What is the main theme?',
        'answer': 'The main theme is resilience.',
        **overrides,
    }
    resp = await client.post('/api/v1/flashcards', json=payload, headers=auth_headers(token))
    assert resp.status_code in (200, 201)
    return resp.json()['data']


# ---------------------------------------------------------------------------
# POST /api/v1/flashcards — Create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_flashcard(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    card = await _create_flashcard(client, reg['token'], book['id'])
    assert card['question'] == 'What is the main theme?'
    assert card['answer'] == 'The main theme is resilience.'
    assert card['book_id'] == book['id']
    assert card['ease_factor'] == 2.5
    assert card['repetition_count'] == 0


@pytest.mark.asyncio
async def test_create_flashcard_unauthenticated(client):
    resp = await client.post('/api/v1/flashcards', json={
        'book_id': '00000000-0000-0000-0000-000000000000',
        'question': 'Q',
        'answer': 'A',
    })
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/flashcards — List
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_flashcards(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_flashcard(client, reg['token'], book['id'])
    await _create_flashcard(
        client, reg['token'], book['id'],
        question='Q2', answer='A2',
    )

    resp = await client.get(
        '/api/v1/flashcards',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['total'] >= 2


@pytest.mark.asyncio
async def test_list_flashcards_filter_by_book(client):
    reg = await register_user(client)
    book1 = await _create_book(client, reg['token'], title='Book 1')
    book2 = await _create_book(client, reg['token'], title='Book 2')
    await _create_flashcard(client, reg['token'], book1['id'])
    await _create_flashcard(client, reg['token'], book2['id'])

    resp = await client.get(
        f"/api/v1/flashcards?book_id={book1['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    items = resp.json()['data']['items']
    assert len(items) == 1
    assert items[0]['book_id'] == book1['id']


# ---------------------------------------------------------------------------
# POST /api/v1/flashcards/{id}/review — SM-2 Review
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_review_flashcard_good_rating(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    card = await _create_flashcard(client, reg['token'], book['id'])

    resp = await client.post(
        f"/api/v1/flashcards/{card['id']}/review",
        json={'rating': 4},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    updated = resp.json()['data']
    assert updated['repetition_count'] == 1
    assert updated['interval'] == 1
    assert updated['last_rating'] == 4


@pytest.mark.asyncio
async def test_review_flashcard_poor_rating_resets(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    card = await _create_flashcard(client, reg['token'], book['id'])
    # First review with good rating
    await client.post(
        f"/api/v1/flashcards/{card['id']}/review",
        json={'rating': 4},
        headers=auth_headers(reg['token']),
    )
    # Second review with poor rating (resets)
    resp = await client.post(
        f"/api/v1/flashcards/{card['id']}/review",
        json={'rating': 1},
        headers=auth_headers(reg['token']),
    )
    updated = resp.json()['data']
    assert updated['repetition_count'] == 0
    assert updated['interval'] == 1


@pytest.mark.asyncio
async def test_review_flashcard_not_found(client):
    reg = await register_user(client)
    resp = await client.post(
        '/api/v1/flashcards/00000000-0000-0000-0000-000000000000/review',
        json={'rating': 3},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/flashcards/due — Due cards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_due_cards(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    # New cards are due immediately (next_review_at = now)
    await _create_flashcard(client, reg['token'], book['id'])

    resp = await client.get(
        '/api/v1/flashcards/due',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['count'] >= 1


@pytest.mark.asyncio
async def test_get_due_cards_filter_by_book(client):
    reg = await register_user(client)
    book1 = await _create_book(client, reg['token'], title='B1')
    book2 = await _create_book(client, reg['token'], title='B2')
    await _create_flashcard(client, reg['token'], book1['id'])
    await _create_flashcard(client, reg['token'], book2['id'])

    resp = await client.get(
        f"/api/v1/flashcards/due?book_id={book1['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    items = resp.json()['data']['items']
    assert all(c['book_id'] == book1['id'] for c in items)


# ---------------------------------------------------------------------------
# GET /api/v1/flashcards/decks — Decks overview
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_decks(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_flashcard(client, reg['token'], book['id'])

    resp = await client.get(
        '/api/v1/flashcards/decks',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['totalCards'] >= 1


# ---------------------------------------------------------------------------
# GET /api/v1/flashcards/review — Review alias (due cards for review UI)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_review_alias(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_flashcard(client, reg['token'], book['id'])

    resp = await client.get(
        '/api/v1/flashcards/review',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'flashcards' in body['data']
