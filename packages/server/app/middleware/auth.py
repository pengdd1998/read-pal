"""Authentication middleware — FastAPI security dependencies.

Mirrors the Node.js auth system exactly:
  - JWT (HS256) with jti-based Redis blacklist
  - bcrypt password hashing (12 rounds)
  - Fail-closed token revocation when Redis is unavailable
"""

import logging
import uuid
from datetime import datetime, timedelta, UTC

from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.models.user import User
from app.utils.i18n import t

logger = logging.getLogger('read-pal.auth')

# --- Password hashing (bcrypt, 12 rounds) -----------------------------------

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto', bcrypt__rounds=12)

# --- Bearer token extractor --------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)

# --- Redis client for blacklist -----------------------------------------------



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

    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(seconds=settings.jwt_expires_seconds))

    to_encode.setdefault('jti', str(uuid.uuid4()))
    to_encode['iat'] = int(now.timestamp())
    to_encode['exp'] = int(expire.timestamp())

    return jwt.encode(to_encode, settings.jwt_secret, algorithm='HS256')


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


# Revocation/ledger/reset-marker logic lives in _auth_ledger (size cap).
from app.middleware._auth_ledger import (  # noqa: F401 — re-exported API
    _was_password_reset,
    is_token_revoked,
    mark_refresh_used,
    revoke_token,
)


from app.middleware._auth_ledger import _get_redis  # noqa: F401 — tests patch this path


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
    """Validate Bearer JWT and return the user dict."""
    if credentials is None:
        _raise_401('UNAUTHORIZED', t('errors.missing_auth'))

    return await _authenticate_jwt(credentials.credentials, db)
