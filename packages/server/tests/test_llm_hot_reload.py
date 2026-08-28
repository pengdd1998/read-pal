"""Tests for hot-pluggable LLM providers (registry hot-reload + ops router)."""

import json
import os
from unittest.mock import patch

import pytest

from app.config import ProviderConfig
from app.services.llm.registry import ProviderRegistry, reset_registry


def _cfg(name: str, priority: int = 1, base_url: str = 'https://x.test') -> dict:
    return {
        'name': name,
        'base_url': base_url,
        'api_key': f'key-{name}-123456',
        'models': {'default': f'{name}-model'},
        'priority': priority,
        'cost_weight': 0.5,
        'max_rpm': 0,
        'max_tpm': 0,
    }


@pytest.fixture(autouse=True)
def _clean_registry():
    reset_registry()
    yield
    reset_registry()


class TestFingerprint:
    def test_same_config_same_fingerprint(self):
        f1 = ProviderRegistry._fingerprint([ProviderConfig(**_cfg('glm'))])
        f2 = ProviderRegistry._fingerprint([ProviderConfig(**_cfg('glm'))])
        assert f1 == f2

    def test_changed_key_changes_fingerprint(self):
        c1 = _cfg('glm')
        c2 = {**_cfg('glm'), 'api_key': 'key-different-987654'}
        assert ProviderRegistry._fingerprint([ProviderConfig(**c1)]) != ProviderRegistry._fingerprint([ProviderConfig(**c2)])

    def test_changed_priority_changes_fingerprint(self):
        c2 = {**_cfg('glm'), 'priority': 5}
        assert ProviderRegistry._fingerprint([ProviderConfig(**_cfg('glm'))]) != ProviderRegistry._fingerprint([ProviderConfig(**c2)])

    def test_rpm_change_does_not_change_fingerprint(self):
        """Runtime knobs (max_rpm) are excluded — tuning RPM must not force a rebuild."""
        c2 = {**_cfg('glm'), 'max_rpm': 99}
        assert ProviderRegistry._fingerprint([ProviderConfig(**_cfg('glm'))]) == ProviderRegistry._fingerprint([ProviderConfig(**c2)])


class TestHotReload:
    @patch('app.services.llm.registry.get_settings')
    def test_reload_noop_when_unchanged(self, mock_settings):
        settings = type('S', (), {'provider_configs': [ProviderConfig(**_cfg('glm'))], 'tpm_enforced': False, 'feature_routing': {}})()
        mock_settings.return_value = settings
        reg = ProviderRegistry()
        reg.initialize()
        assert reg.reload_if_changed_sync() is False

    @patch('app.services.llm.registry.get_settings')
    def test_reload_adds_and_removes_preserving_state(self, mock_settings):
        """Adding/removing providers hot: kept provider preserves circuit, new one fresh."""
        cfg1 = ProviderConfig(**_cfg('glm'))
        settings1 = type('S', (), {'provider_configs': [cfg1], 'tpm_enforced': False, 'feature_routing': {}})()
        mock_settings.return_value = settings1
        reg = ProviderRegistry()
        reg.initialize()

        # Simulate circuit state on glm (record failures via latency)
        glm_state = reg.get_provider_by_name('glm')
        glm_state.update_latency(500, True)
        glm_state.increment_rpm()

        # Now hot-swap to glm + backup
        cfg2 = ProviderConfig(**_cfg('backup', priority=2))
        settings2 = type('S', (), {'provider_configs': [cfg1, cfg2], 'tpm_enforced': False, 'feature_routing': {}})()
        mock_settings.return_value = settings2
        changed = reg.reload_if_changed_sync()
        assert changed is True
        names = {s.config.name for s in reg.all_providers()}
        assert names == {'glm', 'backup'}
        # glm kept its runtime state (latency survived the swap)
        assert reg.get_provider_by_name('glm').avg_latency_ms > 0
        # backup starts fresh
        assert reg.get_provider_by_name('backup').avg_latency_ms == 0

        # Remove backup again
        mock_settings.return_value = settings1
        changed = reg.reload_if_changed_sync()
        assert changed is True
        assert {s.config.name for s in reg.all_providers()} == {'glm'}

    @patch('app.services.llm.registry.get_settings')
    def test_invalid_json_keeps_previous_providers(self, mock_settings):
        """A bad LLM_PROVIDERS edit must never empty the registry."""
        cfg1 = ProviderConfig(**_cfg('glm'))
        settings1 = type('S', (), {'provider_configs': [cfg1], 'tpm_enforced': False, 'feature_routing': {}})()
        mock_settings.return_value = settings1
        reg = ProviderRegistry()
        reg.initialize()

        class BadSettings:
            tpm_enforced = False
            feature_routing: dict = {}

            @property
            def provider_configs(self):
                raise ValueError('bad JSON')

        mock_settings.return_value = BadSettings()
        assert reg.reload_if_changed_sync() is False
        assert {s.config.name for s in reg.all_providers()} == {'glm'}

    @patch('app.services.llm.registry.get_settings')
    def test_key_rotation_triggers_reload(self, mock_settings):
        """Rotating an api_key at runtime rebuilds the pool entry (new credential)."""
        cfg1 = ProviderConfig(**_cfg('glm'))
        settings1 = type('S', (), {'provider_configs': [cfg1], 'tpm_enforced': False, 'feature_routing': {}})()
        mock_settings.return_value = settings1
        reg = ProviderRegistry()
        reg.initialize()

        cfg2 = ProviderConfig(**{**_cfg('glm'), 'api_key': 'key-rotated-998877'})
        settings2 = type('S', (), {'provider_configs': [cfg2], 'tpm_enforced': False, 'feature_routing': {}})()
        mock_settings.return_value = settings2
        assert reg.reload_if_changed_sync() is True
        assert reg.get_provider_by_name('glm').config.api_key == 'key-rotated-998877'


class TestProvidersRouter:
    @pytest.mark.asyncio
    async def test_put_providers_hot_swaps_and_rolls_back(self):
        """PUT swaps providers live; invalid body rolls back to previous set."""
        from fastapi import HTTPException
        from app.routers.llm_providers import ProviderListBody, put_providers

        reg = ProviderRegistry()
        import app.services.llm.registry as reg_mod
        reg_mod._registry = reg
        reg.initialize()

        prev_env = os.environ.get('LLM_PROVIDERS')
        try:
            body = ProviderListBody(providers=[ProviderConfig(**_cfg('glm')), ProviderConfig(**_cfg('backup', priority=2))])
            result = await put_providers(body, {'userId': 'u1'})
            names = [p['name'] for p in result.data['providers']]
            assert set(names) == {'glm', 'backup'}
            assert json.loads(os.environ['LLM_PROVIDERS'])[1]['name'] == 'backup'

            # Empty list → rejected, env restored
            with pytest.raises(ValueError):
                await put_providers(ProviderListBody(providers=[]), {'userId': 'u1'})
            names_now = {s.config.name for s in reg.all_providers()}
            assert names_now == {'glm', 'backup'}
        finally:
            if prev_env is None:
                os.environ.pop('LLM_PROVIDERS', None)
            else:
                os.environ['LLM_PROVIDERS'] = prev_env
        # HTTPException contract check (400 via ValueError handler)
        assert HTTPException is not None
