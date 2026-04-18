"""Authentication middleware — FastAPI security dependencies.

Mirrors the Node.js auth system exactly:
  - JWT (HS256) with jti-based Redis blacklist
  - API key support (rpk_ prefix, SHA-256 hash lookup)
  - bcrypt password hashing (12 rounds)
  - Fail-closed token revocation when Redis is unavailable
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.models.api_key import ApiKey, hash_api_key, is_api_key_format
from app.models.user import User

logger = logging.getLogger('read-pal.auth')

# --- Password hashing (bcrypt, 12 rounds) -----------------------------------

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto', bcrypt__rounds=12)

# --- Bearer token extractor --------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)

# --- Redis client for blacklist -----------------------------------------------

_redis_client: aioredis.Redis | None = None
_in_memory_blacklist: set[str] = set()
_redis_ever_connected: bool = False
_MAX_IN_MEMORY_BLACKLIST = 10_000

TOKEN_BLACKLIST_PREFIX = 'auth:blacklist:'


def _get_redis() -> aioredis.Redis:
    """Lazily initialise a shared async Redis client."""
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
    return _redis_client


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
    except Exception:
        logger.warning('Redis unavailable — token revocation stored in-memory only')


async def is_token_revoked(jti: str) -> bool:
    """Check whether a token's jti has been blacklisted.

    Fail-closed strategy (mirrors Node.js):
      1. Check Redis — if reachable, authoritative answer.
      2. If Redis is down, check in-memory fallback.
      3. If Redis was *never* connected, fail-closed (reject).
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
    except Exception:
        if jti in _in_memory_blacklist:
            return True
        if not _redis_ever_connected:
            return True  # fail-closed
        return False


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Validate Bearer token (JWT or API key) and return the user dict.

    Returns ``{id, email, name}`` on success; raises 401 on failure.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={'code': 'UNAUTHORIZED', 'message': 'Missing or invalid authorization header'},
        )

    token = credentials.credentials

    # --- API key path ---
    if is_api_key_format(token):
        key_hash = hash_api_key(token)
        result = await db.execute(
            select(ApiKey).where(ApiKey.key_hash == key_hash),
        )
        api_key = result.scalar_one_or_none()

        if api_key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={'code': 'INVALID_API_KEY', 'message': 'Invalid API key'},
            )

        result = await db.execute(
            select(User).where(User.id == api_key.user_id),
        )
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={'code': 'USER_NOT_FOUND', 'message': 'API key owner not found'},
            )

        # Fire-and-forget last_used_at update
        async def _touch_last_used() -> None:
            try:
                api_key.last_used_at = datetime.now(timezone.utc)
                await db.commit()
            except Exception:
                logger.debug('API key last_used_at update failed', exc_info=True)

        asyncio.create_task(_touch_last_used())

        return {
            'id': str(user.id),
            'email': user.email,
            'name': user.name,
        }

    # --- JWT path ---
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=['HS256'])
    except JWTError as exc:
        # Distinguish expired vs invalid for better client handling
        error_msg = 'Token has expired' if 'expired' in str(exc).lower() else 'Invalid token'
        error_code = 'TOKEN_EXPIRED' if 'expired' in str(exc).lower() else 'INVALID_TOKEN'
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={'code': error_code, 'message': error_msg},
        ) from exc

    jti = payload.get('jti')
    if jti and await is_token_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={'code': 'TOKEN_REVOKED', 'message': 'Token has been revoked'},
        )

    user_id = payload.get('userId') or payload.get('sub') or ''

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'USER_NOT_FOUND',
                'message': 'User account not found. Please sign in again.',
            },
        )

    return {
        'id': str(user.id),
        'email': user.email,
        'name': user.name,
    }


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any] | None:
    """Same as get_current_user but returns None on failure instead of 401."""
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None
