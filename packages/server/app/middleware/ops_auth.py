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

from fastapi import Header, HTTPException, status


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
