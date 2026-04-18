"""Auth routes — mirrors the Node.js auth endpoints exactly.

All responses follow the shape: ``{"success": true, "data": {...}}``
or raise ``HTTPException`` with matching error codes.
"""

import json
import logging
import uuid
from datetime import datetime, timezone

import redis.asyncio as aioredis
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
    account_limiter,
    login_limiter,
    password_reset_limiter,
    refresh_limiter,
    register_limiter,
)
from app.models.book import Book, BookFileType, BookStatus
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UpdateProfileRequest,
    UserResponse,
)

logger = logging.getLogger('read-pal.auth')

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])

BCRYPT_ROUNDS = 12
MAX_PASSWORD_LENGTH = 72

# --- Redis client for password reset tokens ----------------------------------

_redis_client: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
    return _redis_client


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
                'message': f'Account temporarily locked. Try again in {minutes_remaining} minutes.',
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
                'message': 'Invalid email or password',
            },
        )

    # Verify password
    if not verify_password(body.password, user.password_hash):
        await lockout.record_failed_login(body.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_CREDENTIALS',
                'message': 'Invalid email or password',
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
                'message': 'A user with this email already exists',
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
    sample = Book(
        user_id=user.id,
        title='The Great Gatsby',
        author='F. Scott Fitzgerald',
        file_type=BookFileType.epub,
        file_size=2048,
        total_pages=180,
        current_page=0,
        status=BookStatus.unread,
        tags=['sample', 'classic', 'fiction'],
    )
    db.add(sample)

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
    result = await db.execute(
        select(User).where(User.id == current_user['id']),
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'User not found'},
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
# PATCH /api/v1/auth/me
# ---------------------------------------------------------------------------

@router.patch('/me')
async def update_me(
    body: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update the authenticated user's profile."""
    result = await db.execute(
        select(User).where(User.id == current_user['id']),
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'User not found'},
        )

    if body.name is not None:
        user.name = body.name
    if body.avatar is not None:
        user.avatar = body.avatar
    if body.settings is not None:
        user.settings = {**(user.settings or {}), **body.settings}

    await db.flush()

    return {
        'success': True,
        'data': {
            'id': str(user.id),
            'email': user.email,
            'name': user.name,
            'avatar': user.avatar,
            'settings': user.settings,
        },
    }


# ---------------------------------------------------------------------------
# POST /api/v1/auth/forgot-password
# ---------------------------------------------------------------------------

@router.post('/forgot-password', dependencies=[password_reset_limiter])
async def forgot_password(body: ForgotPasswordRequest) -> MessageResponse:
    """Generate a password reset token stored in Redis (1hr TTL).

    Always returns success to prevent email enumeration.
    """
    try:
        r = _get_redis()
        settings = get_settings()

        # Check if user exists (silently ignore if not)
        from app.db import async_session

        async with async_session() as db:
            result = await db.execute(
                select(User).where(User.email == body.email),
            )
            user = result.scalar_one_or_none()

        if user is not None:
            reset_token = str(uuid.uuid4())
            await r.set(
                f'password-reset:{reset_token}',
                json.dumps({'userId': str(user.id), 'email': user.email}),
                ex=3600,  # 1 hour
            )
            logger.info('Password reset requested for %s', body.email)

    except Exception:
        # Silently ignore errors to prevent enumeration
        logger.debug('Error during forgot-password flow', exc_info=True)

    return MessageResponse(
        data={'message': 'If an account with that email exists, a reset link has been sent.'},
    )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/reset-password
# ---------------------------------------------------------------------------

@router.post('/reset-password', dependencies=[password_reset_limiter])
async def reset_password(body: ResetPasswordRequest) -> MessageResponse:
    """Validate reset token and update the user's password."""
    r = _get_redis()
    data = await r.get(f'password-reset:{body.token}')

    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                'code': 'INVALID_TOKEN',
                'message': 'Reset token is invalid or expired. Please request a new one.',
            },
        )

    payload = json.loads(data)
    user_id = payload['userId']

    from app.db import async_session

    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    'code': 'INVALID_TOKEN',
                    'message': 'Reset token is invalid or expired.',
                },
            )

        user.password_hash = hash_password(body.password)
        await db.commit()

    # Consume the token so it cannot be reused
    await r.delete(f'password-reset:{body.token}')

    logger.info('Password reset successful')

    return MessageResponse(
        data={'message': 'Password has been reset successfully. You can now sign in.'},
    )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------

@router.post('/logout')
async def logout(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> MessageResponse:
    """Revoke the current JWT token."""
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

    return MessageResponse(data={'message': 'Logged out successfully'})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/refresh
# ---------------------------------------------------------------------------

@router.post('/refresh', dependencies=[refresh_limiter])
async def refresh(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Revoke the old token and issue a new one."""
    from jose import jwt as jose_jwt
    from app.middleware.auth import is_token_revoked

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
                        'message': 'Token has already been revoked',
                    },
                )

            exp = decoded.get('exp')
            if jti and exp:
                await revoke_token(jti, exp)

        except HTTPException:
            raise
        except Exception:
            pass

    # Generate new token
    token = create_access_token({'userId': current_user['id']})

    return {
        'success': True,
        'data': {'token': token},
    }


# ---------------------------------------------------------------------------
# DELETE /api/v1/auth/account
# ---------------------------------------------------------------------------

@router.delete('/account', dependencies=[account_limiter])
async def delete_account(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Delete user account and all cascading data."""
    user_id = current_user['id']

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={'code': 'UNAUTHORIZED', 'message': 'Not authenticated'},
        )

    await db.delete(user)
    await db.flush()

    logger.info('Account deleted: %s', user_id)

    return MessageResponse(data={'message': 'Account deleted successfully'})
