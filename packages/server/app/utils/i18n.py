"""Simple JSON-based i18n translation system."""

import json
import logging
from pathlib import Path

logger = logging.getLogger('read-pal.i18n')

SUPPORTED_LANGUAGES = ['en', 'zh']
DEFAULT_LANGUAGE = 'en'

_translations: dict[str, dict] = {}


def load_translations() -> None:
    """Load all locale JSON files on startup."""
    translations_dir = Path(__file__).parent.parent / 'translations'
    for lang in SUPPORTED_LANGUAGES:
        path = translations_dir / f'{lang}.json'
        if path.exists():
            _translations[lang] = json.loads(path.read_text(encoding='utf-8'))
            logger.info('Loaded %d translation keys for %s', len(_translations[lang]), lang)
        else:
            logger.warning('Translation file not found: %s', path)
    # Flatten nested keys with dot notation for lookup
    for lang in list(_translations.keys()):
        _translations[lang] = _flatten(_translations[lang])


def _flatten(d: dict, prefix: str = '') -> dict[str, str]:
    """Flatten nested dict to dot-notation keys."""
    items: dict[str, str] = {}
    for k, v in d.items():
        key = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            items.update(_flatten(v, key))
        else:
            items[key] = v
    return items


def t(key: str, lang: str = DEFAULT_LANGUAGE, **kwargs) -> str:
    """Get translated string by key, with optional interpolation."""
    lang = lang if lang in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
    msg = _translations.get(lang, {}).get(key)
    if msg is None:
        msg = _translations.get(DEFAULT_LANGUAGE, {}).get(key, key)
    return msg.format(**kwargs) if kwargs else msg


def get_supported_languages() -> list[str]:
    return SUPPORTED_LANGUAGES


async def _get_user_lang(
    db: 'AsyncSession',
    user_id: 'UUID',
    *,
    fallback_lang: str | None = None,
) -> str:
    """Get user's language preference.

    When ``fallback_lang`` is provided (e.g. from a JWT claim), it is
    returned immediately without any DB or Redis lookup.  Otherwise,
    falls back to Redis cache (24h TTL) → DB query.
    """
    # Fast path: caller already knows the lang (e.g. from JWT claims)
    if fallback_lang and fallback_lang in SUPPORTED_LANGUAGES:
        return fallback_lang

    from sqlalchemy import select
    from app.models.user import User

    cache_key = f'user:lang:{user_id}'

    # Try Redis cache first
    try:
        from app.core.redis import get_redis
        redis = get_redis()
        cached = await redis.get(cache_key)
        if cached:
            lang = cached.decode() if isinstance(cached, bytes) else cached
            return lang if lang in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
    except Exception:
        pass  # Redis unavailable — fall through to DB

    # DB query
    result = await db.execute(
        select(User.settings).where(User.id == user_id)
    )
    settings = result.scalar_one_or_none()
    if settings and isinstance(settings, dict):
        lang = settings.get('language', DEFAULT_LANGUAGE)
        lang = lang if lang in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
    else:
        lang = DEFAULT_LANGUAGE

    # Store in Redis for 24h
    try:
        from app.core.redis import get_redis
        redis = get_redis()
        await redis.setex(cache_key, 86400, lang)
    except Exception:
        pass

    return lang
