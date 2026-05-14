"""ASGI request logging middleware — method, path, status, latency, user."""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Callable, MutableMapping

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.context import bind_request_context, bind_user_id, clear_request_context

logger = structlog.get_logger('read-pal.request')


def _extract_user_id_from_jwt(token: str) -> str | None:
    """Extract sub (user_id) from JWT payload without full verification."""
    try:
        import base64
        parts = token.split('.')
        if len(parts) < 2:
            return None
        payload_b64 = parts[1]
        # Fix base64 padding
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += '=' * padding
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return str(payload.get('sub') or payload.get('userId') or '') or None
    except Exception:
        return None

_SKIP_PATHS = frozenset({
    '/api/v1/health',
    '/favicon.ico',
    '/robots.txt',
})


class RequestLogMiddleware:
    """Pure ASGI middleware that logs every HTTP request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return

        path = scope.get('path', '')
        if path in _SKIP_PATHS:
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex[:12]
        scope.setdefault('state', {})['request_id'] = request_id

        method = scope.get('method', 'GET')
        start = time.monotonic()
        status_code = 500

        # Bind request context for downstream loggers
        bind_request_context(request_id=request_id, path=path, method=method)

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message['type'] == 'http.response.start':
                status_code = message.get('status', 500)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            logger.error(
                '%s %s → 500 (unhandled exception)',
                method,
                path,
                status_code=status_code,
                latency_ms=0,
                exc_info=True,
            )
            raise
        finally:
            latency_ms = int((time.monotonic() - start) * 1000)
            # Extract user_id from JWT in Authorization header
            user_id = None
            headers = scope.get('headers') or []
            for name, value in headers:
                if name == b'authorization' and value.startswith(b'Bearer '):
                    token = value[7:].decode('utf-8', errors='replace')
                    user_id = _extract_user_id_from_jwt(token)
                    if user_id:
                        bind_user_id(user_id)
                    break

            log_level = logging.WARNING if status_code >= 500 else logging.INFO
            logger.log(
                log_level,
                '%s %s → %d (%dms)',
                method,
                path,
                status_code,
                latency_ms,
                status_code=status_code,
                latency_ms=latency_ms,
                user_id=str(user_id) if user_id else None,
            )
            clear_request_context()
