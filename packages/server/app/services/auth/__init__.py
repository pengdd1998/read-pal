"""Auth service — business logic for authentication.

Handles user lookup, password verification, token management,
and user registration. All database and crypto operations live here.

This package re-exports all public functions so that existing imports
like ``from app.services.auth_service import authenticate_user`` keep
working.
"""

from app.services.auth._login import authenticate_user
from app.services.auth._token import (
    refresh_tokens,
    revoke_access_token,
    revoke_refresh_token,
)
from app.services.auth._user import (
    change_user_password,
    check_google_oauth_configured,
    get_user_profile,
    register_user,
)

__all__ = [
    'authenticate_user',
    'change_user_password',
    'check_google_oauth_configured',
    'get_user_profile',
    'refresh_tokens',
    'register_user',
    'revoke_access_token',
    'revoke_refresh_token',
]
