"""Tests for book club endpoints — CRUD, membership, discussions."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# POST /api/v1/book-clubs/ — create club
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_club(client):
    """POST / creates a new book club and returns id, name, inviteCode."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'Test Club'},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body['success'] is True
    assert 'id' in body['data']
    assert body['data']['name'] == 'Test Club'
    assert body['data']['inviteCode'] is not None


# ---------------------------------------------------------------------------
# GET /api/v1/book-clubs/discover — discover public clubs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_discover_clubs(client):
    """GET /discover returns paginated list of public clubs."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/book-clubs/discover', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'items' in body['data']
    assert 'total' in body['data']
    assert 'page' in body['data']
    assert 'perPage' in body['data']


# ---------------------------------------------------------------------------
# GET /api/v1/book-clubs/ — list user's clubs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_clubs_empty(client):
    """GET / returns empty list when user has no clubs."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/book-clubs/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['items'] == []
    assert body['data']['total'] == 0


@pytest.mark.asyncio
async def test_list_clubs_after_create(client):
    """GET / returns clubs the user belongs to."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'My Club'},
    )

    resp = await client.get('/api/v1/book-clubs/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['total'] == 1
    assert body['data']['items'][0]['name'] == 'My Club'


# ---------------------------------------------------------------------------
# GET /api/v1/book-clubs/{club_id} — get club details
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_club(client):
    """GET /{club_id} returns club details."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'Detail Club'},
    )
    club_id = create_resp.json()['data']['id']

    resp = await client.get(f'/api/v1/book-clubs/{club_id}', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['name'] == 'Detail Club'
    assert body['data']['memberCount'] == 1


@pytest.mark.asyncio
async def test_get_club_not_found(client):
    """GET /{club_id} returns 404 for non-existent club."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/book-clubs/00000000-0000-0000-0000-000000000000',
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/v1/book-clubs/{club_id} — update club
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_club(client):
    """PATCH /{club_id} updates club name and returns full data."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'Original'},
    )
    club_id = create_resp.json()['data']['id']

    resp = await client.patch(
        f'/api/v1/book-clubs/{club_id}',
        headers=headers,
        json={'name': 'Updated'},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['id'] == club_id
    assert body['data']['name'] == 'Updated'
    assert 'description' in body['data']
    assert 'isPrivate' in body['data']
    assert 'maxMembers' in body['data']


@pytest.mark.asyncio
async def test_update_club_forbidden_for_non_admin(client):
    """PATCH /{club_id} returns 403 if user is not admin/moderator."""
    reg_a = await register_user(client, email='admin@test.com', name='Admin')
    headers_a = auth_headers(reg_a['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers_a,
        json={'name': 'Owned Club'},
    )
    club_id = create_resp.json()['data']['id']

    reg_b = await register_user(client, email='other@test.com', name='Other')
    headers_b = auth_headers(reg_b['token'])

    resp = await client.patch(
        f'/api/v1/book-clubs/{club_id}',
        headers=headers_b,
        json={'name': 'Hacked'},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_club_invalid_value_returns_400(client):
    """PATCH whose sanitized name becomes empty returns 400 INVALID_INPUT, not 403.

    The name passes initial schema validation, the router sanitizes HTML,
    then re-validation fails — the global ValueError handler must map it
    to 400 INVALID_INPUT (never FORBIDDEN).
    """
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'Valid Club'},
    )
    club_id = create_resp.json()['data']['id']

    resp = await client.patch(
        f'/api/v1/book-clubs/{club_id}',
        headers=headers,
        json={'name': '<script></script>'},
    )
    assert resp.status_code == 400
    assert resp.json()['detail']['code'] == 'INVALID_INPUT'


@pytest.mark.asyncio
async def test_update_club_not_found_returns_404(client):
    """PATCH on a non-existent club returns 404, not 403."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.patch(
        '/api/v1/book-clubs/00000000-0000-0000-0000-000000000000',
        headers=headers,
        json={'name': 'Ghost Club'},
    )
    assert resp.status_code == 404
    assert resp.json()['detail']['code'] == 'NOT_FOUND'


@pytest.mark.asyncio
async def test_update_club_invalid_value_not_403(client):
    """PATCH with an invalid field value is a validation error, never 403.

    Regression: the router used to map ANY ValueError to 403 FORBIDDEN,
    so a validation failure looked like a permission problem.
    """
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'Valid Club'},
    )
    club_id = create_resp.json()['data']['id']

    # max_members violates the le=100 schema constraint
    resp = await client.patch(
        f'/api/v1/book-clubs/{club_id}',
        headers=headers,
        json={'maxMembers': 500},
    )
    assert resp.status_code != 403
    assert resp.status_code == 422
    assert resp.json()['detail']['code'] == 'VALIDATION_ERROR'

    # The club must be unchanged by the rejected update
    detail = await client.get(f'/api/v1/book-clubs/{club_id}', headers=headers)
    assert detail.json()['data']['maxMembers'] != 500


@pytest.mark.asyncio
async def test_delete_club_not_found_returns_404(client):
    """DELETE on a non-existent club returns 404, not 403."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.delete(
        '/api/v1/book-clubs/00000000-0000-0000-0000-000000000000',
        headers=headers,
    )
    assert resp.status_code == 404
    assert resp.json()['detail']['code'] == 'NOT_FOUND'


# ---------------------------------------------------------------------------
# DELETE /api/v1/book-clubs/{club_id} — delete club
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_club(client):
    """DELETE /{club_id} removes the club (204)."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'To Delete'},
    )
    club_id = create_resp.json()['data']['id']

    resp = await client.delete(
        f'/api/v1/book-clubs/{club_id}', headers=headers,
    )
    assert resp.status_code == 204

    # Verify it's gone
    get_resp = await client.get(
        f'/api/v1/book-clubs/{club_id}', headers=headers,
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_club_forbidden_for_non_admin(client):
    """DELETE /{club_id} returns 403 if user is not admin."""
    reg_a = await register_user(client, email='admin@test.com', name='Admin')
    headers_a = auth_headers(reg_a['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers_a,
        json={'name': 'Protected Club'},
    )
    club_id = create_resp.json()['data']['id']

    reg_b = await register_user(client, email='other@test.com', name='Other')
    headers_b = auth_headers(reg_b['token'])

    resp = await client.delete(
        f'/api/v1/book-clubs/{club_id}', headers=headers_b,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/v1/book-clubs/join — join by invite code
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_join_club(client):
    """POST /join lets another user join via inviteCode."""
    reg_a = await register_user(client, email='owner@test.com', name='Owner')
    headers_a = auth_headers(reg_a['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers_a,
        json={'name': 'Joinable'},
    )
    invite_code = create_resp.json()['data']['inviteCode']

    reg_b = await register_user(client, email='joiner@test.com', name='Joiner')
    headers_b = auth_headers(reg_b['token'])

    resp = await client.post(
        '/api/v1/book-clubs/join',
        headers=headers_b,
        json={'invite_code': invite_code},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'id' in body['data']
    assert body['data']['name'] == 'Joinable'


@pytest.mark.asyncio
async def test_join_club_invalid_code(client):
    """POST /join returns 400 for invalid invite code."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/book-clubs/join',
        headers=headers,
        json={'invite_code': 'INVALID'},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/v1/book-clubs/{club_id}/leave — leave club
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_leave_club_not_a_member_returns_403(client):
    """Leaving a club you never joined is a permission problem (403), not
    a validation error — pinned after the ValueError/PermissionError split."""
    reg_a = await register_user(client, email='owner2@test.com', name='Owner')
    headers_a = auth_headers(reg_a['token'])
    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers_a,
        json={'name': 'Not Yours'},
    )
    club_id = create_resp.json()['data']['id']

    reg_b = await register_user(client, email='stranger@test.com', name='Stranger')
    headers_b = auth_headers(reg_b['token'])

    resp = await client.post(f'/api/v1/book-clubs/{club_id}/leave', headers=headers_b)
    assert resp.status_code == 403
    assert resp.json()['detail']['code'] == 'FORBIDDEN'



@pytest.mark.asyncio
async def test_leave_club(client):
    """POST /{club_id}/leave lets a member leave the club."""
    reg_a = await register_user(client, email='owner@test.com', name='Owner')
    headers_a = auth_headers(reg_a['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers_a,
        json={'name': 'Leavable'},
    )
    club_id = create_resp.json()['data']['id']
    invite_code = create_resp.json()['data']['inviteCode']

    reg_b = await register_user(client, email='leaver@test.com', name='Leaver')
    headers_b = auth_headers(reg_b['token'])

    await client.post(
        '/api/v1/book-clubs/join',
        headers=headers_b,
        json={'invite_code': invite_code},
    )

    resp = await client.post(
        f'/api/v1/book-clubs/{club_id}/leave',
        headers=headers_b,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['message'] == 'Left the club'


# ---------------------------------------------------------------------------
# POST /api/v1/book-clubs/join-code — alias for join
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_join_by_code(client):
    """POST /join-code works as an alias for /join."""
    reg_a = await register_user(client, email='owner@test.com', name='Owner')
    headers_a = auth_headers(reg_a['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers_a,
        json={'name': 'Alias Club'},
    )
    invite_code = create_resp.json()['data']['inviteCode']

    reg_b = await register_user(client, email='coder@test.com', name='Coder')
    headers_b = auth_headers(reg_b['token'])

    resp = await client.post(
        '/api/v1/book-clubs/join-code',
        headers=headers_b,
        json={'invite_code': invite_code},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['name'] == 'Alias Club'


# ---------------------------------------------------------------------------
# GET /api/v1/book-clubs/{club_id}/members — list members
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_members(client):
    """GET /{club_id}/members returns list of club members."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'Members Club'},
    )
    club_id = create_resp.json()['data']['id']

    resp = await client.get(
        f'/api/v1/book-clubs/{club_id}/members', headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert isinstance(body['data'], list)
    assert len(body['data']) == 1
    assert body['data'][0]['role'] == 'admin'


# ---------------------------------------------------------------------------
# GET /api/v1/book-clubs/{club_id}/progress — reading progress
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_club_progress(client):
    """GET /{club_id}/progress returns club reading progress."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'Progress Club'},
    )
    club_id = create_resp.json()['data']['id']

    resp = await client.get(
        f'/api/v1/book-clubs/{club_id}/progress', headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['clubId'] == club_id
    assert isinstance(body['data']['membersProgress'], list)
    assert isinstance(body['data']['averageProgress'], int)


@pytest.mark.asyncio
async def test_get_club_progress_not_found(client):
    """GET /{club_id}/progress returns 404 for non-existent club."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/book-clubs/00000000-0000-0000-0000-000000000000/progress',
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/book-clubs/{club_id}/discussions — list discussions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_discussions(client):
    """GET /{club_id}/discussions returns paginated discussion list."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'Discuss Club'},
    )
    club_id = create_resp.json()['data']['id']

    resp = await client.get(
        f'/api/v1/book-clubs/{club_id}/discussions', headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'items' in body['data']
    assert 'total' in body['data']
    assert 'page' in body['data']
    assert 'perPage' in body['data']


# ---------------------------------------------------------------------------
# POST /api/v1/book-clubs/{club_id}/discussions — add discussion
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_discussion(client):
    """POST /{club_id}/discussions adds a discussion post (201)."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={'name': 'Chat Club'},
    )
    club_id = create_resp.json()['data']['id']

    resp = await client.post(
        f'/api/v1/book-clubs/{club_id}/discussions',
        headers=headers,
        json={'content': 'Hello!'},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body['success'] is True
    assert 'id' in body['data']
    assert body['data']['clubId'] == club_id
    assert body['data']['userId'] == reg['user']['id']
    assert body['data']['content'] == 'Hello!'
    assert body['data']['createdAt'] is not None


@pytest.mark.asyncio
async def test_add_discussion_forbidden_for_non_member(client):
    """POST /{club_id}/discussions returns 403 if user is not a member."""
    reg_a = await register_user(client, email='owner@test.com', name='Owner')
    headers_a = auth_headers(reg_a['token'])

    create_resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers_a,
        json={'name': 'Private Chat'},
    )
    club_id = create_resp.json()['data']['id']

    reg_b = await register_user(client, email='stranger@test.com', name='Stranger')
    headers_b = auth_headers(reg_b['token'])

    resp = await client.post(
        f'/api/v1/book-clubs/{club_id}/discussions',
        headers=headers_b,
        json={'content': 'Intruder!'},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Auth guards — 401 without token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_club_returns_401_without_auth(client):
    resp = await client.post(
        '/api/v1/book-clubs/', json={'name': 'No Auth'},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_clubs_returns_401_without_auth(client):
    resp = await client.get('/api/v1/book-clubs/')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_club_returns_401_without_auth(client):
    resp = await client.get(
        '/api/v1/book-clubs/00000000-0000-0000-0000-000000000000',
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# XSS sanitization on user-text fields (esp. discussions — user-to-user content)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_club_strips_html(client):
    """POST /book-clubs/ must sanitize name/description/coverImage."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    resp = await client.post(
        '/api/v1/book-clubs/',
        headers=headers,
        json={
            'name': '<script>alert(1)</script>Book Club',
            'description': '<b>desc</b>',
            'coverImage': '<img src=x>cover.png',
        },
    )
    assert resp.status_code == 201
    # The POST response only returns id/name/inviteCode; re-fetch to verify description.
    club_id = resp.json()['data']['id']
    assert '<' not in resp.json()['data']['name']
    assert 'Book Club' in resp.json()['data']['name']

    detail = await client.get(
        f'/api/v1/book-clubs/{club_id}', headers=headers,
    )
    data = detail.json()['data']
    assert '<' not in data['name'] and '>' not in data['name']
    assert data['description'] is None or '<' not in data['description']


@pytest.mark.asyncio
async def test_update_club_strips_html(client):
    """PATCH /book-clubs/{id} must sanitize like POST does."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    create = await client.post(
        '/api/v1/book-clubs/', headers=headers, json={'name': 'Old'},
    )
    club_id = create.json()['data']['id']

    resp = await client.patch(
        f'/api/v1/book-clubs/{club_id}',
        headers=headers,
        json={
            'name': '<script>x</script>New',
            'description': '<i>desc</i>',
            'coverImage': '<svg/onload=alert(1)>x',
        },
    )
    assert resp.status_code == 200
    data = resp.json()['data']
    assert '<' not in data['name'] and '>' not in data['name']
    assert 'New' in data['name']
    assert data['description'] is None or '<' not in data['description']


@pytest.mark.asyncio
async def test_add_discussion_strips_html(client):
    """POST /book-clubs/{id}/discussions must sanitize content (user-to-user XSS vector)."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    create = await client.post(
        '/api/v1/book-clubs/', headers=headers, json={'name': 'Disc Club'},
    )
    club_id = create.json()['data']['id']

    resp = await client.post(
        f'/api/v1/book-clubs/{club_id}/discussions',
        headers=headers,
        json={'content': '<script>alert("XSS")</script>Hello members!'},
    )
    assert resp.status_code == 201
    data = resp.json()['data']
    assert '<' not in data['content'] and '>' not in data['content']
    assert 'Hello members' in data['content']
