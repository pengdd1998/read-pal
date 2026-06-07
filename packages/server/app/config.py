import json
import logging
import re
from functools import lru_cache
from typing import Any

from pydantic import BaseModel, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger('read-pal.config')


class ProviderConfig(BaseModel):
    """Configuration for a single LLM provider."""

    name: str
    base_url: str
    api_key: str
    models: dict[str, str]  # {"default": "model-name", "fallback": "model-name"}
    priority: int = 1  # lower = preferred
    cost_weight: float = 0.5  # used for "cheapest" routing
    max_rpm: int = 0  # 0 = unlimited

    @property
    def default_model(self) -> str:
        return self.models.get('default', '')

    @property
    def fallback_model(self) -> str | None:
        return self.models.get('fallback')


def _parse_duration(value: str) -> int:
    """Parse a duration string like '7d', '1h', '30m' into seconds."""
    match = re.match(r'^(\d+)([dhms])$', value.lower().strip())
    if not match:
        raise ValueError(
            f'Invalid duration format: {value!r}. '
            f'Expected format like "7d", "1h", "30m", "60s"',
        )
    amount = int(match.group(1))
    unit = match.group(2)
    multipliers = {
        'd': 86400,
        'h': 3600,
        'm': 60,
        's': 1,
    }
    return amount * multipliers[unit]


class Settings(BaseSettings):
    """Application settings — all values loaded from .env / environment variables.

    No defaults here: .env is the single source of truth.
    See .env.example for required variables.
    """

    model_config = SettingsConfigDict(
        env_file='.env',
        case_sensitive=False,
    )

    # Database
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str

    # Redis
    redis_url: str

    # GLM AI
    glm_api_key: str
    glm_base_url: str
    default_model: str
    fallback_model: str
    llm_timeout_seconds: int
    llm_max_retries: int
    circuit_failure_threshold: int
    circuit_reset_timeout_seconds: int
    max_embedding_calls: int
    embedding_enabled: bool = True

    # Multi-provider LLM routing
    llm_providers: str = ''  # JSON array of ProviderConfig dicts
    llm_feature_routing: str = '{}'  # JSON dict: feature -> strategy

    # JWT
    jwt_secret: str
    jwt_expires_in: str
    jwt_access_web: str
    jwt_access_mobile: str
    jwt_refresh_web: str
    jwt_refresh_mobile: str

    # App
    app_env: str
    frontend_url: str
    cors_origins: str

    # Logging
    log_level: str
    log_json: bool
    llm_log_enabled: bool
    llm_log_retention_days: int

    # Cache TTL (duration strings — parsed to seconds)
    cache_llm_ttl: str = '30m'
    cache_rag_ttl: str = '30m'
    cache_knowledge_ttl: str = '7d'
    cache_data_ttl: str = '5m'
    cache_recommendation_ttl: str = '10m'
    cache_llm_max_entries: int = 500

    # SMTP (optional — console fallback when unset)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None

    @computed_field
    @property
    def database_url(self) -> str:
        """Async PostgreSQL connection string."""
        return (
            f'postgresql+asyncpg://{self.db_user}:{self.db_password}'
            f'@{self.db_host}:{self.db_port}/{self.db_name}'
        )

    @computed_field
    @property
    def jwt_expires_seconds(self) -> int:
        """JWT expiration parsed to integer seconds."""
        return _parse_duration(self.jwt_expires_in)

    @computed_field
    @property
    def jwt_access_web_seconds(self) -> int:
        return _parse_duration(self.jwt_access_web)

    @computed_field
    @property
    def jwt_access_mobile_seconds(self) -> int:
        return _parse_duration(self.jwt_access_mobile)

    @computed_field
    @property
    def jwt_refresh_web_seconds(self) -> int:
        return _parse_duration(self.jwt_refresh_web)

    @computed_field
    @property
    def jwt_refresh_mobile_seconds(self) -> int:
        return _parse_duration(self.jwt_refresh_mobile)

    @computed_field
    @property
    def is_dev(self) -> bool:
        """Whether running in development mode."""
        return self.app_env == 'development'

    @computed_field
    @property
    def provider_configs(self) -> list[ProviderConfig]:
        """Parse LLM_PROVIDERS JSON; fall back to legacy GLM config."""
        if self.llm_providers.strip():
            try:
                raw: list[dict[str, Any]] = json.loads(self.llm_providers)
                return [ProviderConfig(**p) for p in raw]
            except (json.JSONDecodeError, Exception) as exc:
                logger.warning('config.provider_configs_parse_failed error=%s', str(exc)[:200])
        # Legacy single-provider fallback
        models: dict[str, str] = {'default': self.default_model}
        if self.fallback_model:
            models['fallback'] = self.fallback_model
        return [ProviderConfig(
            name='glm',
            base_url=self.glm_base_url,
            api_key=self.glm_api_key,
            models=models,
            priority=1,
            cost_weight=0.3,
            max_rpm=0,
        )]

    @computed_field
    @property
    def feature_routing(self) -> dict[str, str]:
        """Parse LLM_FEATURE_ROUTING JSON."""
        if self.llm_feature_routing.strip():
            try:
                return json.loads(self.llm_feature_routing)
            except json.JSONDecodeError:
                logger.warning('config.feature_routing_parse_failed')
        return {}

    @computed_field
    @property
    def cache_llm_ttl_seconds(self) -> int:
        return _parse_duration(self.cache_llm_ttl)

    @computed_field
    @property
    def cache_rag_ttl_seconds(self) -> int:
        return _parse_duration(self.cache_rag_ttl)

    @computed_field
    @property
    def cache_knowledge_ttl_seconds(self) -> int:
        return _parse_duration(self.cache_knowledge_ttl)

    @computed_field
    @property
    def cache_data_ttl_seconds(self) -> int:
        return _parse_duration(self.cache_data_ttl)

    @computed_field
    @property
    def cache_recommendation_ttl_seconds(self) -> int:
        return _parse_duration(self.cache_recommendation_ttl)

    def validate_production(self) -> list[str]:
        """Validate settings for production — raises on insecure secrets."""
        errors: list[str] = []
        if not self.is_dev:
            if 'change' in self.jwt_secret.lower() or len(self.jwt_secret) < 32:
                errors.append(
                    'JWT_SECRET must be a strong secret (>= 32 chars) in production'
                )
            if self.db_password in ('readpal_dev', 'changeme', 'password'):
                errors.append(
                    'DB_PASSWORD must be changed from default in production'
                )
        if errors:
            raise RuntimeError(
                'Production validation failed:\n' + '\n'.join(f'  - {e}' for e in errors)
            )
        return errors


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance for dependency injection."""
    return Settings()
