"""Auth routes — mirrors the Node.js auth endpoints exactly.

All responses follow the shape: ``{"success": true, "data": {...}}``
or raise ``HTTPException`` with matching error codes.

Related routers:
- ``app.routers.password_reset`` — forgot-password / reset-password
- ``app.routers.account`` — delete-account, update-profile (PATCH /me)
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.middleware.auth import (
    create_access_token,
    create_token_pair,
    get_current_user,
    hash_password,
    revoke_token,
    set_auth_cookies,
    clear_auth_cookies,
    verify_password,
)
from app.middleware.login_lockout import get_login_lockout
from app.middleware.rate_limiter import (
    login_limiter,
    refresh_limiter,
    register_limiter,
)
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshTokenRequest,
    RegisterRequest,
    UserResponse,
)
from app.schemas.common import GenericResponse
from app.utils.i18n import DEFAULT_LANGUAGE, _get_user_lang, t

logger = logging.getLogger('read-pal.auth')

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])


# ---------------------------------------------------------------------------
# GET /api/auth/google/status
# ---------------------------------------------------------------------------

@router.get('/google/status', response_model=GenericResponse)
async def google_oauth_status() -> dict:
    """Return whether Google OAuth is configured.

    Public endpoint (no auth required) — the login page polls this to
    decide whether to render the "Sign in with Google" button.
    """
    settings = get_settings()
    configured = bool(getattr(settings, 'google_client_id', None))
    return {'success': True, 'data': {'configured': configured}}


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login
# ---------------------------------------------------------------------------

@router.post('/login', dependencies=[login_limiter])
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Authenticate with email and password, return JWT."""
    lockout = get_login_lockout()

    # Check account lockout
    is_locked, minutes_remaining = await lockout.check_lockout(body.email)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                'code': 'ACCOUNT_LOCKED',
                'message': t('errors.account_locked', minutes=minutes_remaining),
            },
        )

    # Find user by email
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user is None or user.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_CREDENTIALS',
                'message': t('errors.invalid_credentials'),
            },
        )

    # Get user language preference for error messages
    lang = await _get_user_lang(db, user.id)

    # Verify password
    if not verify_password(body.password, user.password_hash):
        await lockout.record_failed_login(body.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_CREDENTIALS',
                'message': t('errors.invalid_credentials', lang),
            },
        )

    # Success — generate token pair and clear lockout counter
    access_token, refresh_token = create_token_pair(str(user.id), body.platform, lang=lang)
    await lockout.clear_failed_logins(body.email)

    # Set HttpOnly cookies for web platform
    set_auth_cookies(response, access_token, refresh_token, body.platform)

    user_data = UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        settings=user.settings or {},
        created_at=user.created_at,
    )

    return AuthResponse(
        data={
            'user': user_data.model_dump(mode='json'),
            'token': access_token,
            'refreshToken': refresh_token,
        },
    )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register
# ---------------------------------------------------------------------------

@router.post('/register', status_code=status.HTTP_201_CREATED, dependencies=[register_limiter])
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Create a new user account and return JWT."""
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == body.email))
    existing = result.scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                'code': 'USER_EXISTS',
                'message': t('errors.user_exists'),
            },
        )

    # Hash password and create user
    password_hash = hash_password(body.password)

    user = User(
        email=body.email,
        name=body.name,
        password_hash=password_hash,
        settings={
            'theme': 'system',
            'fontSize': 16,
            'fontFamily': 'Inter',
            'readingGoal': 2,
            'dailyReadingMinutes': 30,
            'notificationsEnabled': True,
        },
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    # Auto-seed a sample book so new users see content immediately
    from app.services.seed_service import seed_sample_data
    await seed_sample_data(db, user.id)

    access_token, refresh_token = create_token_pair(
        str(user.id), body.platform, lang=DEFAULT_LANGUAGE,
    )

    # Set HttpOnly cookies for web platform
    set_auth_cookies(response, access_token, refresh_token, body.platform)

    user_data = UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        settings=user.settings or {},
        created_at=user.created_at,
    )

    return AuthResponse(
        data={
            'user': user_data.model_dump(mode='json'),
            'token': access_token,
            'refreshToken': refresh_token,
        },
    )


# ---------------------------------------------------------------------------
# GET /api/v1/auth/me
# ---------------------------------------------------------------------------

@router.get('/me', response_model=GenericResponse)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the authenticated user's profile."""
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    result = await db.execute(
        select(User).where(User.id == current_user['id']),
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.user_not_found', lang)},
        )

    return {
        'success': True,
        'data': {
            'id': str(user.id),
            'email': user.email,
            'name': user.name,
            'avatar': user.avatar,
            'settings': user.settings,
            'createdAt': user.created_at.isoformat() if user.created_at else None,
        },
    }


# ---------------------------------------------------------------------------
# POST /api/v1/auth/change-password
# ---------------------------------------------------------------------------

@router.post('/change-password')
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Change password for an authenticated user."""
    result = await db.execute(
        select(User).where(User.id == current_user['id']),
    )
    user = result.scalar_one_or_none()

    if user is None or user.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'User not found'},
        )

    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'INVALID_PASSWORD', 'message': 'Current password is incorrect'},
        )

    user.password_hash = hash_password(body.new_password)
    await db.flush()

    # Invalidate existing JWTs issued before this password change
    from datetime import datetime, timezone
    from app.core.redis import get_redis
    now_ts = int(datetime.now(timezone.utc).timestamp())
    redis = get_redis()
    await redis.set(
        f'auth:password_changed:{current_user["id"]}',
        str(now_ts),
        ex=86400 * 90,  # 90 days
    )

    return MessageResponse(data={'message': 'Password changed successfully'})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------

@router.post('/logout')
async def logout(
    request: Request,
    response: Response,
    body: LogoutRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Revoke the current JWT token and optional refresh token."""
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))

    # Clear HttpOnly cookies
    clear_auth_cookies(response)

    # Revoke access token from Authorization header
    auth_header = request.headers.get('authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        try:
            import jwt as _jwt

            settings = get_settings()
            decoded = _jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=['HS256'],
            )
            jti = decoded.get('jti')
            exp = decoded.get('exp')
            if jti and exp:
                await revoke_token(jti, exp)
        except Exception as exc:
            # Token may be invalid/expired — still return success for idempotent logout
            logger.warning('Logout access token revocation skipped: %s', exc)

    # Revoke refresh token if provided
    if body and body.refresh_token:
        try:
            import jwt as _jwt

            settings = get_settings()
            decoded = _jwt.decode(
                body.refresh_token,
                settings.jwt_secret,
                algorithms=['HS256'],
            )
            jti = decoded.get('jti')
            exp = decoded.get('exp')
            if jti and exp:
                await revoke_token(jti, exp)
        except Exception as exc:
            logger.warning('Logout refresh token revocation skipped: %s', exc)

    return MessageResponse(data={'message': t('errors.logged_out', lang)})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/refresh
# ---------------------------------------------------------------------------

@router.post('/refresh', response_model=GenericResponse, dependencies=[refresh_limiter])
async def refresh(
    request: Request,
    response: Response,
    body: RefreshTokenRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Exchange a valid refresh token for a new access + refresh token pair.

    The old refresh token is revoked (rotation) to prevent reuse.
    Supports refresh token from request body or HttpOnly cookie.
    """
    import jwt as _jwt
    from jwt import ExpiredSignatureError, InvalidTokenError
    from app.middleware.auth import is_token_revoked, REFRESH_COOKIE_NAME

    settings = get_settings()

    # Read refresh token from cookie or request body
    refresh_token = None
    if body and body.refresh_token:
        refresh_token = body.refresh_token
    else:
        refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_TOKEN',
                'message': 'Refresh token is required',
            },
        )

    try:
        payload = _jwt.decode(
            refresh_token,
            settings.jwt_secret,
            algorithms=['HS256'],
        )
    except (ExpiredSignatureError, InvalidTokenError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_TOKEN',
                'message': 'Invalid or expired refresh token',
            },
        ) from exc

    # Validate token type
    if payload.get('type') != 'refresh':
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_TOKEN',
                'message': 'Provided token is not a refresh token',
            },
        )

    # Check revocation
    jti = payload.get('jti')
    if jti and await is_token_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'TOKEN_REVOKED',
                'message': 'Refresh token has been revoked',
            },
        )

    # Verify user still exists
    user_id = payload.get('userId') or payload.get('sub') or ''
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'USER_NOT_FOUND',
                'message': 'User account not found',
            },
        )

    # Revoke the old refresh token (rotation)
    exp = payload.get('exp')
    if jti and exp:
        await revoke_token(jti, exp)

    # Issue new token pair
    access_token, new_refresh_token = create_token_pair(str(user.id))

    # Set HttpOnly cookies (web platform)
    set_auth_cookies(response, access_token, new_refresh_token, 'web')

    return {
        'success': True,
        'data': {
            'token': access_token,
            'refreshToken': new_refresh_token,
        },
    }
