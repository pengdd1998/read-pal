"""Authentication middleware — FastAPI security dependencies.

Supports dual auth modes:
  - Bearer token (Authorization header) — used by mobile and API key clients
  - HttpOnly cookie — used by web frontend for XSS-resistant token storage

Also supports:
  - API key (rpk_ prefix, SHA-256 hash lookup)
  - bcrypt password hashing (12 rounds)
  - Fail-closed token revocation when Redis is unavailable
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt as pyjwt
from jwt import ExpiredSignatureError, InvalidTokenError
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.redis import get_redis as _get_redis
from app.db import get_db
from app.models.api_key import ApiKey, hash_api_key, is_api_key_format
from app.models.user import User

logger = logging.getLogger('read-pal.auth')

# --- Password hashing (bcrypt, 12 rounds) -----------------------------------

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto', bcrypt__rounds=12)

# --- Bearer token extractor --------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)

# --- Token blacklist state (singleton) ----------------------------------------

class BlacklistState:
    """Singleton holding mutable blacklist state — avoids module-level globals."""

    _instance: BlacklistState | None = None

    def __new__(cls) -> BlacklistState:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.in_memory_blacklist: set[str] = set()
            cls._instance.redis_ever_connected: bool = False
        return cls._instance

    @property
    def max_in_memory(self) -> int:
        return 10_000


_blacklist_state = BlacklistState()

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

    return pyjwt.encode(to_encode, settings.jwt_secret, algorithm='HS256')


def create_token_pair(
    user_id: str,
    platform: str = 'web',
    lang: str = 'en',
) -> tuple[str, str]:
    """Create an access + refresh token pair.

    Returns (access_token, refresh_token).
    Platform 'mobile' gets longer-lived tokens than 'web'.
    ``lang`` is embedded in the access token so the middleware can
    return it without a DB/Redis lookup on every request.
    """
    settings = get_settings()

    if platform == 'mobile':
        access_ttl = timedelta(seconds=settings.jwt_access_mobile_seconds)
        refresh_ttl = timedelta(seconds=settings.jwt_refresh_mobile_seconds)
    else:
        access_ttl = timedelta(seconds=settings.jwt_access_web_seconds)
        refresh_ttl = timedelta(seconds=settings.jwt_refresh_web_seconds)

    access_token = create_access_token(
        {'userId': user_id, 'type': 'access', 'lang': lang},
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
    state = _blacklist_state

    # Always record in-memory so the fallback is up-to-date
    state.in_memory_blacklist.add(jti)
    if len(state.in_memory_blacklist) > state.max_in_memory:
        # Evict oldest entries (simple set doesn't preserve order, but
        # this prevents unbounded growth)
        to_remove = len(state.in_memory_blacklist) - state.max_in_memory
        for key in list(state.in_memory_blacklist)[:to_remove]:
            state.in_memory_blacklist.discard(key)

    try:
        r = _get_redis()
        ttl = max(exp - int(datetime.now(timezone.utc).timestamp()), 1)
        await r.setex(f'{TOKEN_BLACKLIST_PREFIX}{jti}', ttl, '1')
        state.redis_ever_connected = True
    except Exception:
        logger.warning('Redis unavailable — token revocation stored in-memory only')


async def is_token_revoked(jti: str) -> bool:
    """Check whether a token's jti has been blacklisted.

    Fail-closed strategy (mirrors Node.js):
      1. Check Redis — if reachable, authoritative answer.
      2. If Redis is down, check in-memory fallback.
      3. If Redis was *never* connected, fail-closed (reject).
    """
    state = _blacklist_state

    try:
        r = _get_redis()
        exists = await r.exists(f'{TOKEN_BLACKLIST_PREFIX}{jti}')
        state.redis_ever_connected = True
        if exists:
            state.in_memory_blacklist.add(jti)
            return True
        return False
    except Exception:
        if jti in state.in_memory_blacklist:
            return True
        if not state.redis_ever_connected:
            return True  # fail-closed
        return False


# ---------------------------------------------------------------------------
# HttpOnly cookie helpers
# ---------------------------------------------------------------------------

ACCESS_COOKIE_NAME = 'access_token'
REFRESH_COOKIE_NAME = 'refresh_token'

# Cookie paths — restrict to API routes so Next.js static assets don't carry them
_COOKIE_PATH = '/api'


def _cookie_max_age(expires_delta: timedelta) -> int:
    """Return max-age in seconds for a cookie."""
    return int(expires_delta.total_seconds())


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    platform: str = 'web',
) -> None:
    """Set HttpOnly auth cookies on a response.

    Only set for web platform — mobile continues using Bearer headers.
    """
    if platform != 'web':
        return

    settings = get_settings()
    secure = not settings.is_dev
    # In production, same-site Lax is sufficient (no cross-origin form posts)
    same_site = 'lax'

    access_max_age = _cookie_max_age(timedelta(seconds=settings.jwt_access_web_seconds))
    refresh_max_age = _cookie_max_age(timedelta(seconds=settings.jwt_refresh_web_seconds))

    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=access_max_age,
        path=_COOKIE_PATH,
        httponly=True,
        secure=secure,
        samesite=same_site,
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=refresh_max_age,
        path=_COOKIE_PATH,
        httponly=True,
        secure=secure,
        samesite=same_site,
    )


def clear_auth_cookies(response: Response) -> None:
    """Clear auth cookies by setting max-age=0."""
    for name in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME):
        response.set_cookie(
            key=name,
            value='',
            max_age=0,
            path=_COOKIE_PATH,
            httponly=True,
            secure=True,
            samesite='lax',
        )


def _extract_token_from_request(request: Request) -> str | None:
    """Extract auth token from cookie first, then Authorization header.

    Cookie takes precedence when present — this supports the HttpOnly
    migration while keeping backward compatibility with Bearer tokens.
    """
    # Try cookie first
    cookie_token = request.cookies.get(ACCESS_COOKIE_NAME)
    if cookie_token:
        return cookie_token

    # Fall back to Authorization header
    auth_header = request.headers.get('authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]

    return None


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Validate token (cookie or Bearer header) and return the user dict.

    Supports dual auth: HttpOnly cookie (web) or Authorization header (mobile/API).
    Returns ``{id, email, name}`` on success; raises 401 on failure.
    """
    token = _extract_token_from_request(request)

    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={'code': 'UNAUTHORIZED', 'message': 'Missing or invalid authorization'},
        )

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

        # Update last_used_at within the request session
        api_key.last_used_at = datetime.now(timezone.utc)
        await db.flush()

        return {
            'id': str(user.id),
            'email': user.email,
            'name': user.name,
        }

    # --- JWT path ---
    settings = get_settings()
    try:
        payload = pyjwt.decode(token, settings.jwt_secret, algorithms=['HS256'])
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={'code': 'TOKEN_EXPIRED', 'message': 'Token has expired'},
        )
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={'code': 'INVALID_TOKEN', 'message': 'Invalid token'},
        ) from exc

    jti = payload.get('jti')
    if jti and await is_token_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={'code': 'TOKEN_REVOKED', 'message': 'Token has been revoked'},
        )

    user_id = payload.get('userId') or payload.get('sub') or ''

    # Check if password was changed after this token was issued
    iat = payload.get('iat')
    if iat and user_id:
        try:
            r = _get_redis()
            changed_ts = await r.get(f'auth:password_changed:{user_id}')
            if changed_ts and int(iat) < int(changed_ts):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={
                        'code': 'TOKEN_REVOKED',
                        'message': 'Password has been changed. Please sign in again.',
                    },
                )
        except HTTPException:
            raise
        except Exception:
            pass  # Redis unavailable — don't block auth

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

    # Extract lang from JWT claims (avoids per-request DB/Redis lookup)
    lang = payload.get('lang', 'en')

    return {
        'id': str(user.id),
        'email': user.email,
        'name': user.name,
        'lang': lang,
    }


async def get_optional_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any] | None:
    """Same as get_current_user but returns None on failure instead of 401."""
    try:
        return await get_current_user(request, credentials, db)
    except HTTPException:
        return None
