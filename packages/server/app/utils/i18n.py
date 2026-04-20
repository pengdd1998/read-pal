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
