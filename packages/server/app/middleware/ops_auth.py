"""Ops-key authentication dependency (P7.2 pattern, shared — P-A).

The ops key authorizes platform-wide views (LLM metrics global scope,
row-level trace browsing). Rules pinned by P7.2:

- The key travels in the ``X-Ops-Key`` header, NEVER in the URL — nginx
  access logs record the full request line.
- Comparison is constant-time (``hmac.compare_digest``).
- Resolution order: process environ (container env / test monkeypatch)
  first, then the settings object (.env-file config — pydantic loads
  .env into Settings but never exports it to the process environ).
- An unset key disables the ops surface entirely (``403`` for everyone)
  rather than falling back to a guessable default.
"""

from __future__ import annotations

import hmac
import os
from typing import Any

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import _authenticate_jwt, _bearer_scheme, _raise_401
from app.utils.i18n import t


def ops_key_valid(provided: str | None) -> bool:
    """Constant-time compare against the configured ops key."""
    from app.config import get_settings

    expected = (os.environ.get('OPS_KEY') or get_settings().ops_key or '').strip()
    return bool(expected and provided and hmac.compare_digest(expected, provided))


async def require_ops_key(
    x_ops_key: str | None = Header(None, alias='X-Ops-Key'),
) -> None:
    """FastAPI dependency: 403 unless a valid ops key is presented.

    For endpoints that are ops-ONLY (cross-user metadata). Endpoints with
    a user-scoped fallback should use ``ops_key_valid`` directly instead.
    """
    if not ops_key_valid(x_ops_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={'code': 'OPS_KEY_REQUIRED', 'message': 'Valid X-Ops-Key header required.'},
        )


async def ops_key_or_current_user(
    x_ops_key: str | None = Header(None, alias='X-Ops-Key'),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any] | None:
    """Ops-console dependency (P-H standalone, 2026-09-26 auth-surface
    change): a valid ops key unlocks the PLATFORM scope with NO user
    session — the ops UI lives outside the product shell and must not
    require a product login (also retires the E0.4 annoyance where an
    unlogged visitor with a valid key was 401-redirected to /auth by the
    web client). Without a key, a valid Bearer session is required (user
    scope). Returns None for platform scope, a user dict for user scope.
    """
    if ops_key_valid(x_ops_key):
        return None
    if credentials is None:
        _raise_401('UNAUTHORIZED', t('errors.missing_auth'))
    return await _authenticate_jwt(credentials.credentials, db)
