"""Request identity extraction for per-user rate limiting and LLM budgeting.

FastAPI dependencies declared at the router level (rate limiters, the daily
LLM budget) run BEFORE route-parameter dependencies such as
``get_current_user``, so they cannot rely on ``request.state.user`` — nothing
sets it. These helpers re-derive the identity straight from the request:

  * user id — cheap HMAC verification of the ``Authorization: Bearer`` JWT
    (signature + expiry only; no DB, no Redis lookups).
  * client IP — RIGHTMOST entry of ``X-Forwarded-For``. Our nginx appends the
    real client address to the right (``$proxy_add_x_forwarded_for``), so any
    attacker-supplied entries sit on the left and are ignored. Falls back to
    ``X-Real-IP``, then the socket peer.

Note: uvicorn's ``--proxy-headers --forwarded-allow-ips=*`` must NOT be used
as a substitute — its middleware takes the LEFTMOST XFF entry, which is the
spoofable one (see packages/server/Dockerfile).
"""

from fastapi import Request
from jose import JWTError, jwt

from app.config import get_settings

_BEARER_PREFIX = 'bearer '


def client_ip(request: Request) -> str:
    """Best-effort client IP, trusting only the rightmost XFF entry."""
    forwarded_for = request.headers.get('x-forwarded-for')
    if forwarded_for:
        entries = [entry.strip() for entry in forwarded_for.split(',')]
        entries = [entry for entry in entries if entry]
        if entries:
            return entries[-1]

    real_ip = request.headers.get('x-real-ip')
    if real_ip and real_ip.strip():
        return real_ip.strip()

    return request.client.host if request.client else 'unknown'


def jwt_user_id(request: Request) -> str | None:
    """Return the signature-verified ``userId``/``sub`` claim, or None.

    Deliberately cheap: HMAC decode only. Revocation, existence, and password
    reset checks stay in ``get_current_user`` — this is for keying/budgeting,
    not authorization.
    """
    auth_header = request.headers.get('authorization') or ''
    if not auth_header.lower().startswith(_BEARER_PREFIX):
        return None

    token = auth_header[len(_BEARER_PREFIX):].strip()
    if not token:
        return None

    try:
        payload = jwt.decode(
            token, get_settings().jwt_secret, algorithms=['HS256'],
        )
    except JWTError:
        # Invalid/expired signature — treat as anonymous; auth will 401 it.
        return None

    user_id = payload.get('userId') or payload.get('sub')
    return str(user_id) if user_id else None


def request_identity(request: Request) -> tuple[str | None, str]:
    """Return ``(user_id | None, client_ip)`` for the request."""
    return jwt_user_id(request), client_ip(request)
