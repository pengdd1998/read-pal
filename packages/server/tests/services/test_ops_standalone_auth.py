"""P-H standalone auth-surface change: ops key unlocks platform scope
without a user session on /stats/llm and /llm-providers (the ops console
moved out of the product shell — no product login required).

Pins: key-only 200 platform scope; no credentials 401; user-scope view
still isolated; the E0.4 redirect scenario (valid key, no Bearer) now
succeeds.
"""
import pytest

from tests.conftest import auth_headers, register_user

OPS_KEY = 'test-ops-key-standalone'


@pytest.fixture
def ops_env(monkeypatch):
    monkeypatch.setenv('OPS_KEY', OPS_KEY)


@pytest.mark.asyncio
async def test_stats_llm_key_only_platform_scope(client, ops_env):
    """Valid ops key, NO Authorization header — platform scope, 200."""
    resp = await client.get(
        '/api/v1/stats/llm?hours=24',
        headers={'X-Ops-Key': OPS_KEY},
    )
    assert resp.status_code == 200
    data = resp.json()['data']
    assert data['total_calls'] >= 0  # full payload, platform window


@pytest.mark.asyncio
async def test_stats_llm_no_credentials_401(client, ops_env):
    """Neither ops key nor Bearer → 401 (not 403: user fallback path)."""
    resp = await client.get('/api/v1/stats/llm?hours=24')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_stats_llm_bad_key_no_bearer_401(client, ops_env):
    resp = await client.get('/api/v1/stats/llm?hours=24', headers={'X-Ops-Key': 'wrong'})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_stats_llm_user_scope_still_isolated(client, ops_env):
    """Bearer without ops key keeps the user-scoped view (R2 boundary)."""
    reg = await register_user(client)
    resp = await client.get(
        '/api/v1/stats/llm?hours=24',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    assert resp.json()['data']['total_calls'] == 0


@pytest.mark.asyncio
async def test_llm_providers_key_only(client, ops_env):
    """ProvidersCard polls /llm-providers — must work without login."""
    resp = await client.get('/api/v1/llm-providers', headers={'X-Ops-Key': OPS_KEY})
    assert resp.status_code == 200
    assert 'providers' in resp.json()['data']
