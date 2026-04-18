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

    # JWT
    jwt_secret: str = 'dev-secret-key-change-in-production-32ch'
    jwt_expires_in: str = '7d'

    # Pinecone (optional)
    pinecone_api_key: str | None = None

    # App
    app_env: str = 'development'

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
    def is_dev(self) -> bool:
        """Whether running in development mode."""
        return self.app_env == 'development'


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance for dependency injection."""
    return Settings()
