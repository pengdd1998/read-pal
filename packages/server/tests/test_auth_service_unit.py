"""Unit tests for auth_service — authentication business logic.

Tests each public function directly with mocked DB session,
password hashing, JWT creation, and lockout mechanism.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from jose import jwt as jose_jwt

from app.services import auth_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(
    *,
    user_id=None,
    email='user@example.com',
    name='Test User',
    password_hash='hashed_password',
    avatar=None,
    settings=None,
    created_at=None,
):
    """Create a mock User object."""
    user = MagicMock()
    user.id = user_id or uuid4()
    user.email = email
    user.name = name
    user.password_hash = password_hash
    user.avatar = avatar
    user.settings = settings or auth_service.DEFAULT_USER_SETTINGS.copy()
    user.created_at = created_at or datetime.now(tz=timezone.utc)
    return user


def _make_db_session():
    """Create a mock AsyncSession."""
    return AsyncMock(spec=['execute', 'add', 'flush', 'refresh'])


def _encode_jwt(payload: dict, secret: str = 'test-secret') -> str:
    """Helper to encode a JWT using the same library as auth_service."""
    return jose_jwt.encode(payload, secret, algorithm='HS256')


# ---------------------------------------------------------------------------
# _build_user_data
# ---------------------------------------------------------------------------


def test_build_user_data_returns_expected_shape():
    from app.services.auth._login import _build_user_data

    user = _make_user()

    result = _build_user_data(user)

    assert result['id'] == str(user.id)
    assert result['email'] == user.email
    assert result['name'] == user.name
    assert result['avatar'] == user.avatar
    assert isinstance(result['settings'], dict)
    assert 'createdAt' in result


def test_build_user_data_with_null_settings():
    from app.services.auth._login import _build_user_data

    user = _make_user()
    user.settings = None

    result = _build_user_data(user)

    assert result['settings'] == {}


# ---------------------------------------------------------------------------
# _build_auth_response
# ---------------------------------------------------------------------------


def test_build_auth_response_returns_expected_shape():
    from app.services.auth._login import _build_auth_response

    user = _make_user()
    access_token = 'access.jwt.token'
    refresh_token = 'refresh.jwt.token'

    result = _build_auth_response(user, access_token, refresh_token)

    assert 'user' in result
    assert result['token'] == access_token
    assert result['refreshToken'] == refresh_token
    assert result['user']['email'] == user.email


# ---------------------------------------------------------------------------
# authenticate_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch('app.services.auth._login.get_login_lockout')
@patch('app.services.auth._login.verify_password', return_value=True)
@patch('app.services.auth._login.create_token_pair', return_value=('access_tok', 'refresh_tok'))
async def test_authenticate_user_success(mock_create_tokens, mock_verify, mock_get_lockout):
    db = _make_db_session()
    user = _make_user(password_hash='$2b$12$hash')

    lockout = AsyncMock()
    lockout.check_lockout.return_value = (False, None)
    lockout.clear_failed_logins = AsyncMock()
    mock_get_lockout.return_value = lockout

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result_mock)

    with patch('app.services.auth._login._get_user_lang', return_value='en'):
        result = await auth_service.authenticate_user(db, 'user@example.com', 'password123', 'web')

    assert result['token'] == 'access_tok'
    assert result['refreshToken'] == 'refresh_tok'
    assert result['user']['email'] == 'user@example.com'
    lockout.clear_failed_logins.assert_awaited_once()


@pytest.mark.asyncio
@patch('app.services.auth._login.get_login_lockout')
async def test_authenticate_user_account_locked(mock_get_lockout):
    db = _make_db_session()

    lockout = AsyncMock()
    lockout.check_lockout.return_value = (True, 12)
    mock_get_lockout.return_value = lockout

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.authenticate_user(db, 'locked@example.com', 'pass', 'web')

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail['code'] == 'ACCOUNT_LOCKED'


@pytest.mark.asyncio
@patch('app.services.auth._login.get_login_lockout')
async def test_authenticate_user_user_not_found(mock_get_lockout):
    db = _make_db_session()

    lockout = AsyncMock()
    lockout.check_lockout.return_value = (False, None)
    mock_get_lockout.return_value = lockout

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.authenticate_user(db, 'nobody@example.com', 'pass', 'web')

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail['code'] == 'INVALID_CREDENTIALS'


@pytest.mark.asyncio
@patch('app.services.auth._login.get_login_lockout')
@patch('app.services.auth._login.verify_password', return_value=False)
async def test_authenticate_user_wrong_password(mock_verify, mock_get_lockout):
    db = _make_db_session()
    user = _make_user(password_hash='$2b$12$hash')

    lockout = AsyncMock()
    lockout.check_lockout.return_value = (False, None)
    lockout.record_failed_login = AsyncMock()
    mock_get_lockout.return_value = lockout

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result_mock)

    from fastapi import HTTPException

    with patch('app.services.auth._login._get_user_lang', return_value='en'):
        with pytest.raises(HTTPException) as exc_info:
            await auth_service.authenticate_user(db, 'user@example.com', 'wrongpass', 'web')

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail['code'] == 'INVALID_CREDENTIALS'
    lockout.record_failed_login.assert_awaited_once()


@pytest.mark.asyncio
@patch('app.services.auth._login.get_login_lockout')
async def test_authenticate_user_null_password_hash(mock_get_lockout):
    """User exists but has no password hash (OAuth-only account)."""
    db = _make_db_session()
    user = _make_user(password_hash=None)

    lockout = AsyncMock()
    lockout.check_lockout.return_value = (False, None)
    mock_get_lockout.return_value = lockout

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result_mock)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.authenticate_user(db, 'oauth@example.com', 'pass', 'web')

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
@patch('app.services.auth._login.get_login_lockout')
@patch('app.services.auth._login.verify_password', return_value=True)
@patch('app.services.auth._login.create_token_pair', return_value=('at', 'rt'))
async def test_authenticate_user_passes_platform_to_token(mock_create_tokens, mock_verify, mock_get_lockout):
    db = _make_db_session()
    user = _make_user()

    lockout = AsyncMock()
    lockout.check_lockout.return_value = (False, None)
    lockout.clear_failed_logins = AsyncMock()
    mock_get_lockout.return_value = lockout

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result_mock)

    with patch('app.services.auth._login._get_user_lang', return_value='en'):
        await auth_service.authenticate_user(db, 'user@example.com', 'pass', 'mobile')

    mock_create_tokens.assert_called_once_with(str(user.id), 'mobile')


# ---------------------------------------------------------------------------
# register_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch('app.services.auth._user.hash_password', return_value='$2b$12$newhash')
@patch('app.services.auth._user.create_token_pair', return_value=('access_tok', 'refresh_tok'))
@patch('app.services.seed_service.seed_sample_data', new_callable=AsyncMock)
async def test_register_user_success(mock_seed, mock_create_tokens, mock_hash):
    db = _make_db_session()

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=existing_result)
    db.flush = AsyncMock()

    # db.refresh must populate the user object with an id
    async def _refresh(user_obj):
        if user_obj.id is None:
            user_obj.id = uuid4()

    db.refresh = AsyncMock(side_effect=_refresh)

    result = await auth_service.register_user(db, 'new@example.com', 'New User', 'Password123!', 'web')

    assert result['token'] == 'access_tok'
    assert result['refreshToken'] == 'refresh_tok'
    assert result['user']['email'] == 'new@example.com'
    assert result['user']['name'] == 'New User'
    mock_seed.assert_awaited_once()


@pytest.mark.asyncio
async def test_register_user_duplicate_email():
    db = _make_db_session()
    existing_user = _make_user(email='dup@example.com')

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = existing_user
    db.execute = AsyncMock(return_value=existing_result)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.register_user(db, 'dup@example.com', 'Dup', 'Password123!', 'web')

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail['code'] == 'USER_EXISTS'


@pytest.mark.asyncio
@patch('app.services.auth._user.hash_password', return_value='$2b$12$newhash')
@patch('app.services.auth._user.create_token_pair', return_value=('at', 'rt'))
@patch('app.services.seed_service.seed_sample_data', new_callable=AsyncMock)
async def test_register_user_sets_default_settings(mock_seed, mock_create_tokens, mock_hash):
    db = _make_db_session()

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=existing_result)

    added_users = []
    db.add = lambda user: added_users.append(user)
    db.flush = AsyncMock()

    async def _refresh(user_obj):
        if user_obj.id is None:
            user_obj.id = uuid4()

    db.refresh = AsyncMock(side_effect=_refresh)

    await auth_service.register_user(db, 'new@example.com', 'New User', 'Password123!', 'web')

    assert len(added_users) == 1
    new_user = added_users[0]
    assert new_user.email == 'new@example.com'
    assert new_user.name == 'New User'
    assert new_user.password_hash == '$2b$12$newhash'
    assert new_user.settings == auth_service.DEFAULT_USER_SETTINGS


@pytest.mark.asyncio
@patch('app.services.auth._user.hash_password', return_value='$2b$12$h')
@patch('app.services.auth._user.create_token_pair', return_value=('at', 'rt'))
@patch('app.services.seed_service.seed_sample_data', new_callable=AsyncMock)
async def test_register_user_passes_platform_to_token(mock_seed, mock_create_tokens, mock_hash):
    db = _make_db_session()

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=existing_result)
    db.add = MagicMock()
    db.flush = AsyncMock()

    async def _refresh(user_obj):
        if user_obj.id is None:
            user_obj.id = uuid4()

    db.refresh = AsyncMock(side_effect=_refresh)

    await auth_service.register_user(db, 'new@example.com', 'New User', 'Password123!', 'mobile')

    mock_create_tokens.assert_called_once()


# ---------------------------------------------------------------------------
# get_user_profile
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_user_profile_found():
    db = _make_db_session()
    user = _make_user()

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result_mock)

    with patch('app.services.auth._user._get_user_lang', return_value='en'):
        profile = await auth_service.get_user_profile(db, str(user.id))

    assert profile['email'] == user.email
    assert profile['name'] == user.name
    assert profile['id'] == str(user.id)
    assert 'createdAt' in profile


@pytest.mark.asyncio
async def test_get_user_profile_not_found():
    db = _make_db_session()

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    from fastapi import HTTPException

    with patch('app.services.auth._user._get_user_lang', return_value='en'):
        with pytest.raises(HTTPException) as exc_info:
            await auth_service.get_user_profile(db, str(uuid4()))

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail['code'] == 'NOT_FOUND'


@pytest.mark.asyncio
async def test_get_user_profile_with_avatar():
    db = _make_db_session()
    user = _make_user(avatar='https://example.com/avatar.png')

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result_mock)

    with patch('app.services.auth._user._get_user_lang', return_value='en'):
        profile = await auth_service.get_user_profile(db, str(user.id))

    assert profile['avatar'] == 'https://example.com/avatar.png'


# ---------------------------------------------------------------------------
# change_user_password
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch('app.services.auth._user.verify_password', return_value=True)
@patch('app.services.auth._user.hash_password', return_value='$2b$12$newhash')
async def test_change_user_password_success(mock_hash, mock_verify):
    db = _make_db_session()
    user = _make_user(password_hash='$2b$12$oldhash')

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()

    with patch('app.services.auth._user._get_user_lang', return_value='en'):
        result = await auth_service.change_user_password(
            db, str(user.id), 'OldPass123!', 'NewPass456!',
        )

    assert isinstance(result, str)
    assert user.password_hash == '$2b$12$newhash'
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
@patch('app.services.auth._user.verify_password', return_value=False)
async def test_change_user_password_wrong_old_password(mock_verify):
    db = _make_db_session()
    user = _make_user(password_hash='$2b$12$oldhash')

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result_mock)

    from fastapi import HTTPException

    with patch('app.services.auth._user._get_user_lang', return_value='en'):
        with pytest.raises(HTTPException) as exc_info:
            await auth_service.change_user_password(
                db, str(user.id), 'WrongOldPass!', 'NewPass456!',
            )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail['code'] == 'INVALID_PASSWORD'


@pytest.mark.asyncio
async def test_change_user_password_user_not_found():
    db = _make_db_session()

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    from fastapi import HTTPException

    with patch('app.services.auth._user._get_user_lang', return_value='en'):
        with pytest.raises(HTTPException) as exc_info:
            await auth_service.change_user_password(
                db, str(uuid4()), 'OldPass!', 'NewPass!',
            )

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_change_user_password_null_password_hash():
    db = _make_db_session()
    user = _make_user(password_hash=None)

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result_mock)

    from fastapi import HTTPException

    with patch('app.services.auth._user._get_user_lang', return_value='en'):
        with pytest.raises(HTTPException) as exc_info:
            await auth_service.change_user_password(
                db, str(user.id), 'OldPass!', 'NewPass!',
            )

    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# refresh_tokens
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch('app.middleware.auth.is_token_revoked', new_callable=AsyncMock, return_value=False)
@patch('app.services.auth._token.revoke_token', new_callable=AsyncMock)
@patch('app.services.auth._token.create_token_pair', return_value=('new_access', 'new_refresh'))
@patch('app.services.auth._token.get_settings')
async def test_refresh_tokens_success(mock_settings, mock_create_tokens, mock_revoke, mock_is_revoked):
    db = _make_db_session()
    user = _make_user()

    settings = MagicMock()
    settings.jwt_secret = 'test-secret'
    mock_settings.return_value = settings

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result_mock)

    refresh_token = _encode_jwt({
        'type': 'refresh',
        'jti': 'unique-jti-123',
        'exp': 9999999999,
        'userId': str(user.id),
        'sub': str(user.id),
    })

    result = await auth_service.refresh_tokens(db, refresh_token)

    assert result['token'] == 'new_access'
    assert result['refreshToken'] == 'new_refresh'
    mock_revoke.assert_awaited()


@pytest.mark.asyncio
@patch('app.services.auth._token.get_settings')
async def test_refresh_tokens_invalid_jwt(mock_settings):
    db = _make_db_session()

    settings = MagicMock()
    settings.jwt_secret = 'test-secret'
    mock_settings.return_value = settings

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.refresh_tokens(db, 'not-a-valid-jwt')

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail['code'] == 'INVALID_TOKEN'


@pytest.mark.asyncio
@patch('app.services.auth._token.get_settings')
async def test_refresh_tokens_wrong_token_type(mock_settings):
    db = _make_db_session()

    settings = MagicMock()
    settings.jwt_secret = 'test-secret'
    mock_settings.return_value = settings

    token = _encode_jwt({
        'type': 'access',  # Wrong type — should be 'refresh'
        'jti': 'unique-jti',
        'exp': 9999999999,
    })

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.refresh_tokens(db, token)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail['code'] == 'INVALID_TOKEN'


@pytest.mark.asyncio
@patch('app.middleware.auth.is_token_revoked', new_callable=AsyncMock, return_value=True)
@patch('app.services.auth._token.get_settings')
async def test_refresh_tokens_revoked_token(mock_settings, mock_is_revoked):
    db = _make_db_session()

    settings = MagicMock()
    settings.jwt_secret = 'test-secret'
    mock_settings.return_value = settings

    token = _encode_jwt({
        'type': 'refresh',
        'jti': 'revoked-jti',
        'exp': 9999999999,
        'userId': str(uuid4()),
    })

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.refresh_tokens(db, token)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail['code'] == 'TOKEN_REVOKED'


@pytest.mark.asyncio
@patch('app.middleware.auth.is_token_revoked', new_callable=AsyncMock, return_value=False)
@patch('app.services.auth._token.revoke_token', new_callable=AsyncMock)
@patch('app.services.auth._token.get_settings')
async def test_refresh_tokens_user_deleted(mock_settings, mock_revoke, mock_is_revoked):
    db = _make_db_session()

    settings = MagicMock()
    settings.jwt_secret = 'test-secret'
    mock_settings.return_value = settings

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    token = _encode_jwt({
        'type': 'refresh',
        'jti': 'valid-jti',
        'exp': 9999999999,
        'userId': str(uuid4()),
    })

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await auth_service.refresh_tokens(db, token)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail['code'] == 'USER_NOT_FOUND'


# ---------------------------------------------------------------------------
# revoke_access_token / revoke_refresh_token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch('app.services.auth._token.revoke_token', new_callable=AsyncMock)
@patch('app.services.auth._token.get_settings')
async def test_revoke_access_token_success(mock_settings, mock_revoke):
    settings = MagicMock()
    settings.jwt_secret = 'test-secret'
    mock_settings.return_value = settings

    token = _encode_jwt({
        'jti': 'access-jti',
        'exp': 9999999999,
        'type': 'access',
    })

    await auth_service.revoke_access_token(token)

    mock_revoke.assert_awaited_once_with('access-jti', 9999999999)


@pytest.mark.asyncio
@patch('app.services.auth._token.get_settings')
async def test_revoke_access_token_invalid_jwt(mock_settings):
    settings = MagicMock()
    settings.jwt_secret = 'test-secret'
    mock_settings.return_value = settings

    # Should not raise, just log warning (best-effort)
    await auth_service.revoke_access_token('invalid-token')


@pytest.mark.asyncio
@patch('app.services.auth._token.revoke_token', new_callable=AsyncMock)
@patch('app.services.auth._token.get_settings')
async def test_revoke_refresh_token_success(mock_settings, mock_revoke):
    settings = MagicMock()
    settings.jwt_secret = 'test-secret'
    mock_settings.return_value = settings

    token = _encode_jwt({
        'jti': 'refresh-jti',
        'exp': 9999999999,
        'type': 'refresh',
    })

    await auth_service.revoke_refresh_token(token)

    mock_revoke.assert_awaited_once_with('refresh-jti', 9999999999)


@pytest.mark.asyncio
@patch('app.services.auth._token.get_settings')
async def test_revoke_refresh_token_invalid_jwt_no_error(mock_settings):
    settings = MagicMock()
    settings.jwt_secret = 'test-secret'
    mock_settings.return_value = settings

    # Should not raise, just log warning (best-effort)
    await auth_service.revoke_refresh_token('garbage-token')


# ---------------------------------------------------------------------------
# check_google_oauth_configured
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch('app.services.auth._user.get_settings')
async def test_check_google_oauth_configured_true(mock_settings):
    settings = MagicMock()
    settings.google_client_id = 'some-client-id'
    mock_settings.return_value = settings

    result = await auth_service.check_google_oauth_configured()

    assert result is True


@pytest.mark.asyncio
@patch('app.services.auth._user.get_settings')
async def test_check_google_oauth_configured_false(mock_settings):
    settings = MagicMock()
    settings.google_client_id = None
    mock_settings.return_value = settings

    result = await auth_service.check_google_oauth_configured()

    assert result is False


# ---------------------------------------------------------------------------
# DEFAULT_USER_SETTINGS
# ---------------------------------------------------------------------------


def test_default_user_settings_has_expected_keys():
    defaults = auth_service.DEFAULT_USER_SETTINGS
    assert 'theme' in defaults
    assert 'fontSize' in defaults
    assert 'fontFamily' in defaults
    assert 'readingGoal' in defaults
    assert 'dailyReadingMinutes' in defaults
    assert 'notificationsEnabled' in defaults


def test_default_user_settings_values():
    defaults = auth_service.DEFAULT_USER_SETTINGS
    assert defaults['theme'] == 'system'
    assert defaults['fontSize'] == 16
    assert defaults['readingGoal'] == 2
    assert defaults['dailyReadingMinutes'] == 30
    assert defaults['notificationsEnabled'] is True
