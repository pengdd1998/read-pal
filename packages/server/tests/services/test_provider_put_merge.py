"""J3 (P-J): provider management — PUT sentinel api_key merge.

The ops console's provider table round-trips configs without secrets
(the state snapshot never returns api_key). An empty api_key in the PUT
body means "keep the live key"; a new provider without any stored key is
rejected so the registry never goes live with an empty credential.
"""
import pytest
from httpx import AsyncClient

from tests.conftest import register_user

BASE = '/api/v1/llm-providers'


def _body(providers: list[dict]) -> dict:
    return {'providers': providers}


def _glm_payload(**over) -> dict:
    p = {
        'name': 'glm',
        'base_url': 'https://open.bigmodel.cn/api/paas/v4',
        'api_key': '',
        'models': {'default': 'glm-4.7-flash'},
        'priority': 1,
        'cost_weight': 0.3,
        'max_rpm': 0,
        'max_tpm': 0,
    }
    p.update(over)
    return p


@pytest.mark.asyncio
async def test_put_empty_api_key_merges_live_key(client):
    reg = await register_user(client)
    headers = {'Authorization': f'Bearer {reg["token"]}'}

    # mutate priority with an empty (sentinel) key
    resp = await client.put(BASE, json=_body([_glm_payload(priority=2)]), headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()['data']
    assert data['changed'] is True
    after = {p['name']: p for p in data['providers']}
    assert after['glm']['priority'] == 2
    # the merged key must be the live one (non-empty in the env the
    # registry now carries)
    import json as _json
    import os
    env_providers = _json.loads(os.environ['LLM_PROVIDERS'])
    assert env_providers[0]['api_key'] != ''
    # cleanup: restore from env semantics via reload endpoint
    del os.environ['LLM_PROVIDERS']
    from app.config import reload_settings
    reload_settings()


@pytest.mark.asyncio
async def test_put_new_provider_without_key_rejected(client):
    reg = await register_user(client)
    headers = {'Authorization': f'Bearer {reg["token"]}'}

    resp = await client.put(BASE, json=_body([_glm_payload(name='brand-new', api_key='')]), headers=headers)
    assert resp.status_code in (400, 422, 500) or resp.json().get('success') is False
    # registry untouched by the failed mutation
    listing = await client.get(BASE, headers=headers)
    names = [p['name'] for p in listing.json()['data']['providers']]
    assert 'brand-new' not in names
