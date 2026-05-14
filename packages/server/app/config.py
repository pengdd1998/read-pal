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
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file='.env',
        case_sensitive=False,
    )

    # Database
    db_host: str = 'localhost'
    db_port: int = 5432
    db_name: str = 'readpal'
    db_user: str = 'readpal'
    db_password: str = 'readpal_dev'

    # Redis
    redis_url: str = 'redis://localhost:6379'

    # GLM AI
    glm_api_key: str = 'dev-key'
    glm_base_url: str = 'https://open.bigmodel.cn/api/paas/v4'
    default_model: str = 'glm-4.7-flash'
    fallback_model: str = 'glm-4-flash'
    llm_timeout_seconds: int = 15
    llm_max_retries: int = 3
    circuit_failure_threshold: int = 5
    circuit_reset_timeout_seconds: int = 30

    # JWT
    jwt_secret: str = 'dev-secret-key-change-in-production-32ch'
    jwt_expires_in: str = '7d'
    jwt_access_web: str = '30m'
    jwt_access_mobile: str = '2h'
    jwt_refresh_web: str = '7d'
    jwt_refresh_mobile: str = '30d'

    # Vector search: currently using in-process cosine similarity over Redis-cached embeddings.
    # For scaling beyond ~100 books, integrate a vector DB (Pinecone, Qdrant, or pgvector).
    # pinecone_api_key: str | None = None  # Removed — not used. Re-enable when integrating vector DB.

    # App
    app_env: str = 'development'
    frontend_url: str = 'http://localhost:3000'
    cors_origins: str = 'http://localhost:3000'  # Comma-separated allowed origins

    # Logging
    log_level: str = 'INFO'
    log_json: bool = False
    llm_log_retention_days: int = 90

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
