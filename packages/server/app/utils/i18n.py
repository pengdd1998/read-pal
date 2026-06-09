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


# Map ValueError messages from services to i18n keys
_VALUE_ERROR_KEY_MAP: dict[str, str] = {
    'Collection not found': 'errors.collection_not_found',
    'Book not found': 'errors.book_not_found',
    'Club not found': 'errors.club_not_found',
    'Club is full': 'errors.club_full',
    'Already a member of this club': 'errors.already_member',
    'Not a member of this club': 'errors.not_member',
    'Invalid invite code': 'errors.invalid_invite_code',
    'Cannot leave — you are the last admin. Delete the club instead.': 'errors.cannot_leave_last_admin',
    'Only admin or moderator can update the club': 'errors.only_admin_moderator_update',
    'Only admin can delete the club': 'errors.only_admin_delete',
    'Must be a member to post discussions': 'errors.must_be_member_post',
    'Webhook not found': 'errors.webhook_not_found',
    'Flashcard not found': 'errors.flashcard_not_found',
    'Share not found': 'errors.share_not_found',
    'Reading book not found': 'errors.reading_book_not_found',
}


def translate_error(exc: ValueError, lang: str = DEFAULT_LANGUAGE) -> str:
    """Translate a ValueError message from a service layer into the user's language."""
    key = _VALUE_ERROR_KEY_MAP.get(str(exc))
    if key:
        return t(key, lang)
    logger.debug('translate_error: unmapped ValueError: %s', str(exc)[:200])
    return t('errors.validation_failed', lang)


async def _get_user_lang(db: 'AsyncSession', user_id: 'UUID') -> str:
    """Get user's language preference from settings."""
    from sqlalchemy import select
    from app.models.user import User

    result = await db.execute(
        select(User.settings).where(User.id == user_id)
    )
    settings = result.scalar_one_or_none()
    if settings and isinstance(settings, dict):
        lang = settings.get('language', DEFAULT_LANGUAGE)
        return lang if lang in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
    return DEFAULT_LANGUAGE
