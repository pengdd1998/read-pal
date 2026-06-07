"""Auth service — re-export facade for backward compatibility.

All business logic lives in ``app.services.auth`` sub-package.
This module re-exports every public symbol so that existing imports
like ``from app.services.auth_service import authenticate_user`` keep
working without changes.
"""

from app.services.auth import (  # noqa: F401
    authenticate_user,
    change_user_password,
    check_google_oauth_configured,
    get_user_profile,
    refresh_tokens,
    register_user,
    revoke_access_token,
    revoke_refresh_token,
)
from app.services.auth._user import DEFAULT_USER_SETTINGS  # noqa: F401

__all__ = [
    'DEFAULT_USER_SETTINGS',
    'authenticate_user',
    'change_user_password',
    'check_google_oauth_configured',
    'get_user_profile',
    'refresh_tokens',
    'register_user',
    'revoke_access_token',
    'revoke_refresh_token',
]
