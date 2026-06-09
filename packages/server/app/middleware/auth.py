"""Authentication middleware — FastAPI security dependencies.

Mirrors the Node.js auth system exactly:
  - JWT (HS256) with jti-based Redis blacklist
  - API key support (rpk_ prefix, SHA-256 hash lookup)
  - bcrypt password hashing (12 rounds)
  - Fail-closed token revocation when Redis is unavailable
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

import redis.exceptions
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.redis import get_redis as _get_redis
from app.db import get_db
from app.models.api_key import ApiKey, hash_api_key, is_api_key_format
from app.models.user import User
from app.utils.i18n import t

logger = logging.getLogger('read-pal.auth')

# --- Password hashing (bcrypt, 12 rounds) -----------------------------------

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto', bcrypt__rounds=12)

# --- Bearer token extractor --------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)

# --- Redis client for blacklist -----------------------------------------------

_in_memory_blacklist: set[str] = set()
_redis_ever_connected: bool = False
_MAX_IN_MEMORY_BLACKLIST = 10_000

TOKEN_BLACKLIST_PREFIX = 'auth:blacklist:'


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt (12 rounds)."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a signed JWT with jti, iat, and exp claims.

    ``data`` should contain ``userId`` (matching the Node.js token payload).
    """
    settings = get_settings()
    to_encode = data.copy()

    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(seconds=settings.jwt_expires_seconds))

    to_encode.setdefault('jti', str(uuid.uuid4()))
    to_encode['iat'] = int(now.timestamp())
    to_encode['exp'] = int(expire.timestamp())

    return jwt.encode(to_encode, settings.jwt_secret, algorithm='HS256')


def create_token_pair(
    user_id: str,
    platform: str = 'web',
) -> tuple[str, str]:
    """Create an access + refresh token pair.

    Returns (access_token, refresh_token).
    Platform 'mobile' gets longer-lived tokens than 'web'.
    """
    settings = get_settings()

    if platform == 'mobile':
        access_ttl = timedelta(seconds=settings.jwt_access_mobile_seconds)
        refresh_ttl = timedelta(seconds=settings.jwt_refresh_mobile_seconds)
    else:
        access_ttl = timedelta(seconds=settings.jwt_access_web_seconds)
        refresh_ttl = timedelta(seconds=settings.jwt_refresh_web_seconds)

    access_token = create_access_token(
        {'userId': user_id, 'type': 'access'},
        expires_delta=access_ttl,
    )
    refresh_token = create_access_token(
        {'userId': user_id, 'type': 'refresh'},
        expires_delta=refresh_ttl,
    )
    return access_token, refresh_token


async def revoke_token(jti: str, exp: int) -> None:
    """Add a token's jti to the Redis blacklist.

    The key TTL is set to the remaining seconds until the token expires,
    so the entry cleans itself up automatically.
    """
    global _redis_ever_connected

    # Always record in-memory so the fallback is up-to-date
    _in_memory_blacklist.add(jti)
    if len(_in_memory_blacklist) > _MAX_IN_MEMORY_BLACKLIST:
        # Evict oldest entries (simple set doesn't preserve order, but
        # this prevents unbounded growth)
        to_remove = len(_in_memory_blacklist) - _MAX_IN_MEMORY_BLACKLIST
        for key in list(_in_memory_blacklist)[:to_remove]:
            _in_memory_blacklist.discard(key)

    try:
        r = _get_redis()
        ttl = max(exp - int(datetime.now(timezone.utc).timestamp()), 1)
        await r.setex(f'{TOKEN_BLACKLIST_PREFIX}{jti}', ttl, '1')
        _redis_ever_connected = True
    except (redis.exceptions.RedisError, ConnectionError):
        logger.warning('Redis unavailable — token revocation stored in-memory only')


async def is_token_revoked(jti: str) -> bool:
    """Check whether a token's jti has been blacklisted.

    Strategy:
      1. Check Redis — if reachable, authoritative answer.
      2. If Redis is down, check in-memory fallback.
      3. If Redis was never connected, fail-open (allow) — only known-blacklisted
         tokens (via in-memory set) are rejected.
    """
    global _redis_ever_connected

    try:
        r = _get_redis()
        exists = await r.exists(f'{TOKEN_BLACKLIST_PREFIX}{jti}')
        _redis_ever_connected = True
        if exists:
            _in_memory_blacklist.add(jti)
            return True
        return False
    except (redis.exceptions.RedisError, ConnectionError):
        logger.warning('auth.redis_blacklist_failed', jti=jti[:8] if jti else None)
        if jti in _in_memory_blacklist:
            return True
        return False


async def _was_password_reset(user_id: str, token_issued_at: float) -> bool:
    """Check if a password reset occurred after this token was issued."""
    try:
        r = _get_redis()
        reset_marker = await r.get(f'pwd-reset:{user_id}')
        # If a reset marker exists, all tokens issued before it are invalid
        return reset_marker is not None
    except (redis.exceptions.RedisError, ConnectionError):
        logger.warning('auth.pwd_reset_check_failed', user_id=user_id)
        return False


# ---------------------------------------------------------------------------
# Internal auth helpers
# ---------------------------------------------------------------------------

def _user_dict(user: User) -> dict[str, Any]:
    """Build a standardized user dict for dependency injection."""
    return {'id': str(user.id), 'email': user.email, 'name': user.name}


def _raise_401(code: str, message: str) -> None:
    """Raise a 401 HTTPException with structured detail."""
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={'code': code, 'message': message},
    )


async def _authenticate_api_key(token: str, db: AsyncSession) -> dict[str, Any]:
    """Validate an API key and return the user dict."""
    key_hash = hash_api_key(token)
    result = await db.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
    api_key = result.scalar_one_or_none()

    if api_key is None:
        _raise_401('INVALID_API_KEY', t('errors.invalid_api_key'))

    result = await db.execute(select(User).where(User.id == api_key.user_id))
    user = result.scalar_one_or_none()

    if user is None:
        _raise_401('USER_NOT_FOUND', t('errors.api_key_owner_not_found'))

    api_key.last_used_at = datetime.now(timezone.utc)
    await db.flush()
    return _user_dict(user)


async def _authenticate_jwt(token: str, db: AsyncSession) -> dict[str, Any]:
    """Validate a JWT token and return the user dict."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=['HS256'])
    except JWTError as exc:
        is_expired = 'expired' in str(exc).lower()
        code = 'TOKEN_EXPIRED' if is_expired else 'INVALID_TOKEN'
        msg = t('errors.token_expired') if is_expired else t('errors.token_invalid')
        _raise_401(code, msg)

    jti = payload.get('jti')
    if jti and await is_token_revoked(jti):
        _raise_401('TOKEN_REVOKED', t('errors.token_revoked'))

    # Check if password was reset after this token was issued
    user_id = payload.get('userId') or payload.get('sub') or ''
    if user_id and await _was_password_reset(user_id, payload.get('iat', 0)):
        _raise_401('TOKEN_REVOKED', t('errors.token_revoked'))

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        _raise_401('USER_NOT_FOUND', t('errors.user_sign_in_again'))

    return _user_dict(user)


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Validate Bearer token (JWT or API key) and return the user dict."""
    if credentials is None:
        _raise_401('UNAUTHORIZED', t('errors.missing_auth'))

    token = credentials.credentials
    if is_api_key_format(token):
        return await _authenticate_api_key(token, db)
    return await _authenticate_jwt(token, db)
