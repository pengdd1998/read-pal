"""Tests for Reading Mirror (Memory Book) endpoints — generate, get, and list."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import auth_headers, register_user


async def _create_book(client, token, **overrides):
    payload = {
        'title': 'Reading Mirror Test',
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


def _mock_llm_section_response(section_type: str) -> dict:
    """Return a predictable mock section response matching the schema."""
    if section_type == 'encounter':
        return {
            'prologue': {
                'text': 'You opened this book on a quiet afternoon...',
                'reading_archetype': 'The Deep Diver',
                'archetype_description': 'You read with intent and focus.',
            },
            'stats': {
                'total_reading_time': '2h 30m',
                'session_count': 5,
                'highlight_count': 12,
                'longest_session': '45m',
            },
        }
    if section_type == 'highlights':
        return {
            'clusters': [
                {
                    'name': 'Identity and Self',
                    'description': 'Passages about personal growth.',
                    'highlights': [
                        {
                            'quote': 'To be yourself in a world that is constantly trying to make you something else.',
                            'page_location': 'chapter-1',
                            'why_it_mattered': 'You highlighted this early in your reading.',
                        },
                    ],
                },
            ],
        }
    if section_type == 'recommendations':
        return {
            'recommendations': [
                {
                    'title': 'Atomic Habits',
                    'author': 'James Clear',
                    'reason': 'Your focus on personal growth suggests interest in practical self-improvement.',
                    'connection_to_current': 'Both explore the tension between identity and behavior.',
                    'urgency': 'now',
                },
            ],
        }
    return {}


def _mock_safe_llm_invoke(side_effects: list | None = None):
    """Create a mock for safe_llm_invoke that returns section data."""
    if side_effects is None:
        side_effects = [
            _mock_llm_section_response('encounter'),
            _mock_llm_section_response('highlights'),
            _mock_llm_section_response('recommendations'),
        ]
    mock = AsyncMock(side_effect=side_effects)
    return mock


# ---------------------------------------------------------------------------
# POST /api/v1/reading-book/generate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_reading_mirror(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    with patch('app.services.memory_book.section_generation.safe_llm_invoke', new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = [
            _mock_llm_section_response('encounter'),
            _mock_llm_section_response('highlights'),
            _mock_llm_section_response('recommendations'),
        ]
        resp = await client.post(
            '/api/v1/reading-book/generate',
            json={'book_id': book['id'], 'format': 'reading_mirror'},
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'sections' in body['data']
    assert len(body['data']['sections']) == 10
    assert body['data']['format'] == 'reading_mirror'

    # Verify section types
    section_types = [s['type'] for s in body['data']['sections']]
    assert 'encounter' in section_types
    assert 'highlights' in section_types
    assert 'recommendations' in section_types
    assert 'attention_map' in section_types  # placeholder


@pytest.mark.asyncio
async def test_generate_memory_book_not_found(client):
    reg = await register_user(client)

    with patch('app.services.memory_book_service.safe_llm_invoke', new_callable=AsyncMock):
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
async def test_regenerate_reuses_successful_sections():
    """Regeneration is incremental: a section that already succeeded (no
    'error') is reused verbatim and NOT re-sent to the LLM; only errored
    sections are retried. This keeps regeneration monotonic under rate-limiting
    — a re-run can't lose a section that previously succeeded."""
    from unittest.mock import MagicMock
    from app.services.memory_book.pipeline import SECTION_TYPES, _generate_all_sections

    # Prior run: 'encounter' succeeded (real content), 'recommendations' errored.
    # Both are ungated LLM sections, so the errored one will be retried via the LLM.
    prior_encounter = {'type': 'encounter', 'prologue': {'text': 'cached narrative'}}
    prior_recs = {'type': 'recommendations', 'error': 'AI generation failed'}
    existing = {'encounter': prior_encounter, 'recommendations': prior_recs}

    call_count = 0

    async def fake_gen(section_type, enriched, **_):
        nonlocal call_count
        call_count += 1
        return {'type': section_type, 'fresh': True}

    with patch(
        'app.services.memory_book.pipeline._generate_section',
        new=AsyncMock(side_effect=fake_gen),
    ):
        sections = await _generate_all_sections(
            {'book': {'title': 'T'}, 'stats': {}},
            user_id=MagicMock(),
            book_id=MagicMock(),
            existing_by_type=existing,
        )

    by_type = {s['type']: s for s in sections}
    # encounter was reused — original content preserved, NOT regenerated
    assert by_type['encounter'].get('prologue', {}).get('text') == 'cached narrative'
    assert by_type['encounter'].get('fresh') is None
    # recommendations errored before — it was regenerated (fresh LLM call)
    assert by_type['recommendations'].get('fresh') is True

    # Only the errored LLM sections should have hit the LLM; encounter must not have
    assert call_count > 0, 'errored sections should be retried'
    # encounter must never have been passed to the LLM
    assert by_type['encounter'].get('fresh') is None


@pytest.mark.asyncio
async def test_get_reading_mirror(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    with patch('app.services.memory_book.section_generation.safe_llm_invoke', new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = [
            _mock_llm_section_response('encounter'),
            _mock_llm_section_response('highlights'),
            _mock_llm_section_response('recommendations'),
        ]
        await client.post(
            '/api/v1/reading-book/generate',
            json={'book_id': book['id'], 'format': 'reading_mirror'},
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
    assert len(body['data']['sections']) == 10


@pytest.mark.asyncio
async def test_get_memory_book_not_generated(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    resp = await client.get(
        f"/api/v1/reading-book/{book['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data'] is None


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

    with patch('app.services.memory_book.section_generation.safe_llm_invoke', new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = [
            _mock_llm_section_response('encounter'),
            _mock_llm_section_response('highlights'),
            _mock_llm_section_response('recommendations'),
        ]
        await client.post(
            '/api/v1/reading-book/generate',
            json={'book_id': book['id'], 'format': 'reading_mirror'},
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
