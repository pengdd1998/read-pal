"""Request-scoped context propagation via structlog contextvars."""

from __future__ import annotations

import structlog.contextvars


def bind_request_context(
    *,
    request_id: str,
    path: str = '',
    method: str = '',
    user_id: str | None = None,
    book_id: str | None = None,
) -> None:
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        path=path,
        method=method,
        **({'user_id': user_id} if user_id else {}),
        **({'book_id': book_id} if book_id else {}),
    )


def bind_user_id(user_id: str) -> None:
    structlog.contextvars.bind_contextvars(user_id=user_id)


def clear_request_context() -> None:
    structlog.contextvars.clear_contextvars()
