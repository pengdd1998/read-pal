"""Structured exception handlers for the FastAPI application.

These convert domain exceptions into proper HTTP responses so that
router endpoints without per-endpoint try/except still return
meaningful status codes instead of opaque 500s.
"""

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = structlog.get_logger('read-pal')


class NotFoundError(ValueError):
    """ValueError subclass that maps to 404 instead of 400."""


async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """ValueError -> 400 (or 404 for NotFoundError subclass)."""
    is_not_found = isinstance(exc, NotFoundError)
    code = 'NOT_FOUND' if is_not_found else 'INVALID_INPUT'
    status_code = 404 if is_not_found else 400
    logger.warning('ValueError on %s: %s', request.url.path, str(exc)[:200])
    user_msg = 'Resource not found' if is_not_found else 'Invalid input'
    return JSONResponse(
        status_code=status_code,
        content={'detail': {'code': code, 'message': user_msg}},
    )


async def permission_error_handler(request: Request, exc: PermissionError) -> JSONResponse:
    """PermissionError -> 403 Forbidden."""
    logger.warning('PermissionError on %s: %s', request.url.path, str(exc)[:200])
    return JSONResponse(
        status_code=403,
        content={'detail': {'code': 'FORBIDDEN', 'message': 'You do not have permission to perform this action'}},
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Return structured 422 responses without exposing internal field details."""
    errors = exc.errors()
    messages = []
    for err in errors:
        field = '.'.join(str(loc) for loc in err.get('loc', []))
        msg = err.get('msg', 'Invalid value')
        messages.append(f'{field}: {msg}' if field else msg)
    return JSONResponse(
        status_code=422,
        content={
            'detail': {
                'code': 'VALIDATION_ERROR',
                'message': '; '.join(messages),
            },
        },
    )


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all that returns a sanitized 500 response."""
    logger.error('unhandled_exception', path=request.url.path, error=str(exc)[:500], exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={'detail': {'code': 'INTERNAL_ERROR', 'message': 'An unexpected error occurred'}},
    )


def register_exception_handlers(app: 'FastAPI') -> None:
    """Attach all exception handlers to the FastAPI app."""
    app.add_exception_handler(ValueError, value_error_handler)
    app.add_exception_handler(PermissionError, permission_error_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, global_exception_handler)
