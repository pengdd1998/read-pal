import json
import logging
import math
import re
from collections import Counter
from functools import lru_cache
from typing import Any

from pydantic import BaseModel, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger('read-pal.config')


def _shannon_entropy(text: str) -> float:
    """Bits-per-char entropy. 'aaaa...' ≈ 0; random 32-char string ≈ 4.5+."""
    if not text:
        return 0.0
    counts = Counter(text)
    n = len(text)
    return -sum((c / n) * math.log2(c / n) for c in counts.values())


def _is_low_entropy_secret(secret: str) -> bool:
    """Detect low-entropy JWT secrets that pass length checks.

    Catches: repeated chars ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    dictionary words padded to length, and other low-entropy patterns that
    a length>=32 check alone misses. Threshold: < 2.5 bits/char OR a single
    char repeating >50% of the string.
    """
    if _shannon_entropy(secret) < 2.5:
        return True
    counts = Counter(secret)
    most_common_count = counts.most_common(1)[0][1]
    return most_common_count / len(secret) > 0.5


class ProviderConfig(BaseModel):
    """Configuration for a single LLM provider."""

    name: str
    base_url: str
    api_key: str
    models: dict[str, str]  # {"default": "model-name", "fallback": "model-name"}
    priority: int = 1  # lower = preferred
    cost_weight: float = 0.5  # used for "cheapest" routing
    max_rpm: int = 0  # 0 = unlimited
    # B2: provider-level tokens-per-minute cap. 0 = unlimited. Conservative
    # defaults for documented free tiers: GLM ~150K, DeepSeek ~60K, GPT-4.1
    # nano ~200K. Only enforced when Settings.tpm_enforced=True (off by
    # default — flip after a week of monitoring to verify caps don't false-
    # positive throttle legit traffic).
    max_tpm: int = 0

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

    # Daily LLM cost cap — Redis-backed per-user counter, resets at UTC midnight.
    # Applies to chat, agent, flashcard generation, knowledge graph, reading book.
    # 0 = unlimited (budget enforcement skipped entirely).
    # Production recommendation: 500 (free tier), 5000 (premium).
    llm_daily_budget: int = 0

    # Daily TOKEN budget per user (P3.2). 0 = disabled. Distinct from
    # llm_daily_budget (which counts REQUESTS). A 200-token and a 16K-token
    # call both consume 1 unit of the requests budget; this counts tokens so
    # long-context abusers can't game the request cap. Pre-charged before
    # every LLM call (chars/4 estimate + reserved output), settled post-call
    # using actual usage from response_metadata.
    llm_daily_token_budget: int = 0

    # B2: gate TPM (tokens-per-minute) enforcement at the provider level.
    # ProviderConfig.max_tpm caps are tracked always (so dashboards see the
    # number); only when this flag is True do we filter at-cap providers out
    # of routing decisions. Defaults False — flip after observing a week of
    # real TPM numbers to confirm caps won't false-positive throttle.
    tpm_enforced: bool = False

    # C1: GLOBAL cap on concurrent LLM streaming requests, enforced via Redis
    # INCR/DECR. The previous in-process asyncio.Semaphore only bounded per-
    # worker concurrency — with N uvicorn workers, the true ceiling was N ×
    # this number. The Redis-backed counter spans all workers on the host.
    #
    # Default raised from 10 → 20 because the global cap replaces the per-
    # worker cap (4 workers × 10 = 40 in the old config; 20 is more
    # conservative but still roomy for a single-VPS deployment).
    llm_max_concurrent_streams: int = 20

    # C2: feature-flag native structured output (response_format=json_object).
    # Default OFF — when ON and a schema_class is passed to safe_llm_invoke,
    # the pool constructs the ChatOpenAI with model_kwargs=
    # {'response_format': {'type': 'json_object'}}. This nudges providers
    # that support it (OpenAI family, GLM, Anthropic-via-passthrough) toward
    # valid JSON output instead of relying on prompt-only contracts.
    #
    # The 3-stage JSON repair ladder in safe_invoke.py stays as a fallback —
    # providers occasionally violate the contract under load. Off-by-default
    # lets ops opt in after verifying their provider chain supports the
    # response_format field (DeepSeek's support is partial; verify before
    # flipping globally).
    llm_native_structured_output: bool = False

    # Idempotency enforcement gate. P0.1: defaults ON now that both web and
    # mobile API clients auto-attach a deterministic Idempotency-Key on
    # mutations (POST/PUT/PATCH) and streaming calls pass a random UUID per
    # click. Closes the double-click → duplicate LLM billing class of bugs
    # (review blocker B1).
    #
    # Set to False in dev/test .env if you need to exercise legacy clients
    # that don't send the header. The middleware silently accepts missing
    # keys when enforcement is off (see app/middleware/idempotency.py).
    idempotency_enforce: bool = True

    # SMTP (optional — console fallback when unset)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None

    # Object storage — MinIO / S3-compatible. Optional: when configured, book
    # covers are uploaded here and book.cover_url holds the public URL; when
    # unset, covers fall back to the generated gradient placeholder.
    oss_endpoint: str | None = None          # host:port, e.g. minio.example.com:9000
    oss_access_key: str | None = None
    oss_secret_key: str | None = None
    oss_bucket: str = 'read-pal'
    oss_public_base_url: str | None = None   # public URL prefix, e.g. https://cdn.example.com/read-pal
    oss_secure: bool = True

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

    @property
    def oss_enabled(self) -> bool:
        """Whether object storage is configured for cover uploads."""
        return bool(
            self.oss_endpoint
            and self.oss_access_key
            and self.oss_secret_key
            and self.oss_public_base_url
        )

    def validate_production(self) -> list[str]:
        """Validate settings for production — raises on insecure secrets."""
        errors: list[str] = []
        if not self.is_dev:
            if 'change' in self.jwt_secret.lower() or len(self.jwt_secret) < 32:
                errors.append(
                    'JWT_SECRET must be a strong secret (>= 32 chars) in production'
                )
            elif _is_low_entropy_secret(self.jwt_secret):
                errors.append(
                    'JWT_SECRET has low entropy (< 2.5 bits/char or > 50% repeated chars). '
                    'Use a randomly generated secret, e.g. `python -c "import secrets; print(secrets.token_urlsafe(48))"`.'
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
