"""Auth routes — thin HTTP handlers that delegate to auth_service.

All responses follow the shape: ``{"success": true, "data": {...}}``
or raise ``HTTPException`` with matching error codes.

Related routers:
- ``app.routers.password_reset`` — forgot-password / reset-password
- ``app.routers.account`` — delete-account, update-profile (PATCH /me)
"""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import (
    login_limiter,
    refresh_limiter,
    register_limiter,
    write_limiter,
)
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshResponse,
    RefreshTokenRequest,
    RegisterRequest,
)
from app.schemas.common import GenericResponse
from app.services.auth_service import (
    authenticate_user,
    change_user_password,
    check_google_oauth_configured,
    get_user_profile,
    refresh_tokens,
    register_user,
    revoke_access_token,
    revoke_refresh_token,
)
from app.utils.i18n import _get_user_lang, t
from app.middleware.rate_limiter import api_limiter

router = APIRouter(prefix='/api/v1/auth', tags=['auth'], dependencies=[api_limiter])


# ---------------------------------------------------------------------------
# GET /api/auth/google/status
# ---------------------------------------------------------------------------

@router.get('/google/status', response_model=GenericResponse)
async def google_oauth_status() -> dict:
    """Return whether Google OAuth is configured."""
    configured = await check_google_oauth_configured()
    return {'success': True, 'data': {'configured': configured}}


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login
# ---------------------------------------------------------------------------

@router.post('/login', response_model=AuthResponse, dependencies=[login_limiter, write_limiter])
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Authenticate with email and password, return JWT."""
    data = await authenticate_user(db, body.email, body.password, body.platform)
    return AuthResponse(data=data)


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register
# ---------------------------------------------------------------------------

@router.post('/register', status_code=status.HTTP_201_CREATED, response_model=AuthResponse, dependencies=[register_limiter, write_limiter])
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Create a new user account and return JWT."""
    data = await register_user(db, body.email, body.name, body.password, body.platform)
    return AuthResponse(data=data)


# ---------------------------------------------------------------------------
# GET /api/v1/auth/me
# ---------------------------------------------------------------------------

@router.get('/me', response_model=GenericResponse)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the authenticated user's profile."""
    profile = await get_user_profile(db, current_user['id'])
    return {'success': True, 'data': profile}


# ---------------------------------------------------------------------------
# POST /api/v1/auth/change-password
# ---------------------------------------------------------------------------

@router.post('/change-password', response_model=MessageResponse, dependencies=[write_limiter])
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Change password for an authenticated user."""
    message = await change_user_password(
        db, current_user['id'], body.current_password, body.new_password,
    )
    return MessageResponse(data={'message': message})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------

@router.post('/logout', response_model=MessageResponse, dependencies=[write_limiter])
async def logout(
    request: Request,
    body: LogoutRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Revoke the current JWT token and optional refresh token."""
    lang = await _get_user_lang(db, current_user['id'])

    auth_header = request.headers.get('authorization', '')
    if auth_header.startswith('Bearer '):
        await revoke_access_token(auth_header[7:])

    if body and body.refresh_token:
        await revoke_refresh_token(body.refresh_token)

    return MessageResponse(data={'message': t('errors.logged_out', lang)})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/refresh
# ---------------------------------------------------------------------------

@router.post('/refresh', response_model=RefreshResponse, dependencies=[refresh_limiter, write_limiter])
async def refresh(
    body: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Exchange a valid refresh token for a new access + refresh token pair."""
    tokens = await refresh_tokens(db, body.refresh_token)
    return {'success': True, 'data': tokens}
