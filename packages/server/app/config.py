import re
from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    def validate_production(self) -> list[str]:
        """Validate settings for production — returns list of warnings."""
        warnings: list[str] = []
        if not self.is_dev:
            if 'change' in self.jwt_secret.lower() or len(self.jwt_secret) < 32:
                warnings.append(
                    'JWT_SECRET must be a strong secret (>= 32 chars) in production'
                )
            if self.db_password in ('readpal_dev', 'changeme', 'password'):
                warnings.append(
                    'DB_PASSWORD must be changed from default in production'
                )
        return warnings


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance for dependency injection."""
    return Settings()
