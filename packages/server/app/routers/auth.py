"""Auth routes — mirrors the Node.js auth endpoints exactly.

All responses follow the shape: ``{"success": true, "data": {...}}``
or raise ``HTTPException`` with matching error codes.

Related routers:
- ``app.routers.password_reset`` — forgot-password / reset-password
- ``app.routers.account`` — delete-account, update-profile (PATCH /me)
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.middleware.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    revoke_token,
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
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UserResponse,
)
from app.utils.i18n import _get_user_lang, t

logger = logging.getLogger('read-pal.auth')

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login
# ---------------------------------------------------------------------------

@router.post('/login', dependencies=[login_limiter])
async def login(
    body: LoginRequest,
    request: Request,
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

    # Success — generate token and clear lockout counter
    token = create_access_token({'userId': str(user.id)})
    await lockout.clear_failed_logins(body.email)

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
            'token': token,
        },
    )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register
# ---------------------------------------------------------------------------

@router.post('/register', status_code=status.HTTP_201_CREATED, dependencies=[register_limiter])
async def register(
    body: RegisterRequest,
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

    # Auto-seed a sample book so new users see content immediately
    from app.services.seed_service import seed_sample_data
    await seed_sample_data(db, user.id)

    token = create_access_token({'userId': str(user.id)})

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
            'token': token,
        },
    )


# ---------------------------------------------------------------------------
# GET /api/v1/auth/me
# ---------------------------------------------------------------------------

@router.get('/me')
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the authenticated user's profile."""
    lang = await _get_user_lang(db, current_user['id'])
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
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------

@router.post('/logout')
async def logout(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Revoke the current JWT token."""
    lang = await _get_user_lang(db, current_user['id'])
    auth_header = request.headers.get('authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        try:
            from jose import jwt as jose_jwt

            settings = get_settings()
            decoded = jose_jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=['HS256'],
            )
            jti = decoded.get('jti')
            exp = decoded.get('exp')
            if jti and exp:
                await revoke_token(jti, exp)
        except Exception:
            # Token may be invalid/expired — still return success for idempotent logout
            pass

    return MessageResponse(data={'message': t('errors.logged_out', lang)})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/refresh
# ---------------------------------------------------------------------------

@router.post('/refresh', dependencies=[refresh_limiter])
async def refresh(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Revoke the old token and issue a new one."""
    from jose import jwt as jose_jwt
    from app.middleware.auth import is_token_revoked

    lang = await _get_user_lang(db, current_user['id'])

    auth_header = request.headers.get('authorization', '')
    if auth_header.startswith('Bearer '):
        old_token = auth_header[7:]
        try:
            settings = get_settings()
            decoded = jose_jwt.decode(
                old_token,
                settings.jwt_secret,
                algorithms=['HS256'],
            )

            jti = decoded.get('jti')
            if jti and await is_token_revoked(jti):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={
                        'code': 'TOKEN_REVOKED',
                        'message': t('errors.token_revoked', lang),
                    },
                )

            exp = decoded.get('exp')
            if jti and exp:
                await revoke_token(jti, exp)

        except HTTPException:
            raise
        except Exception:
            logger.warning('Failed to revoke old token during refresh', exc_info=True)

    # Generate new token
    token = create_access_token({'userId': current_user['id']})

    return {
        'success': True,
        'data': {'token': token},
    }
