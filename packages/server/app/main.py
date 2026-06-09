import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from sqlalchemy import select, text

from app.config import get_settings
from app.core.logging import setup_logging
from app.core.redis import get_redis
from app.db import async_session
from app.middleware.request_log import RequestLogMiddleware

logger = structlog.get_logger('read-pal')
settings = get_settings()

_is_production = os.getenv('APP_ENV', 'development') == 'production'


class ApiCompatMiddleware:
    """Pure ASGI middleware — rewrites paths without breaking CORS.

    BaseHTTPMiddleware wraps responses in a way that strips CORS headers
    added by inner middleware (CORSMiddleware). Rewriting as pure ASGI
    avoids this by passing scope/send directly to the next app.

    Rewrites:
      /api/*            -> /api/v1/*  (except /api/docs, /api/openapi)
      /api/v1/reading-sessions/*  -> /api/v1/sessions/*
      /api/v1/memory-books/*      -> /api/v1/reading-book/*
      /api/v1/agents/*            -> /api/v1/agent/*
    """

    _PATH_REWRITES: list[tuple[str, str]] = [
        ('/api/v1/reading-sessions', '/api/v1/sessions'),
        ('/api/v1/memory-books', '/api/v1/reading-book'),
        ('/api/v1/agents', '/api/v1/agent'),
    ]

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'http':
            path = scope.get('path', '')

            # Step 1: /api/ -> /api/v1/
            if (
                path.startswith('/api/')
                and not path.startswith('/api/v1/')
                and not path.startswith('/api/docs')
                and not path.startswith('/api/openapi')
            ):
                path = path.replace('/api/', '/api/v1/', 1)

            # Step 2: legacy route name rewrites
            for old_prefix, new_prefix in self._PATH_REWRITES:
                if path.startswith(old_prefix):
                    path = path.replace(old_prefix, new_prefix, 1)
                    break

            scope['path'] = path
            scope['raw_path'] = path.encode()

        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup + shutdown via modern FastAPI pattern."""
    # --- Startup ---
    is_prod = os.getenv('APP_ENV', 'development') == 'production'
    setup_logging(level=settings.log_level, json_output=is_prod or settings.log_json)
    from app.utils.i18n import load_translations
    load_translations()
    logger.info(
        'api_starting',
        env=settings.app_env,
        model=settings.default_model,
    )

    try:
        settings.validate_production()
    except RuntimeError as exc:
        logger.error('production_validation_failed', detail=str(exc))
        raise

    if settings.is_dev:
        try:
            from app.db import init_db
            await init_db()
            logger.info('database_tables_created')
        except Exception as exc:
            logger.warning('auto_create_tables_failed', error=str(exc))

    asyncio.create_task(_log_cleanup_loop())
    asyncio.create_task(_stale_session_cleanup_loop())
    await _fix_absurd_session_durations()

    from app.services.llm import _trace_writer
    _trace_writer.start()
    logger.info('LLM trace writer started')

    yield

    # --- Shutdown ---
    from app.services.llm import shutdown_llm
    from app.core.redis import close_redis
    await shutdown_llm()
    await close_redis()


app = FastAPI(
    title='Read-Pal API',
    version='0.1.0',
    docs_url=None if _is_production else '/api/v1/docs',
    redoc_url=None if _is_production else '/api/v1/redoc',
    openapi_url=None if _is_production else '/api/v1/openapi.json',
    redirect_slashes=True,
    lifespan=lifespan,
)

# --- Structured exception handlers ---
# These convert domain exceptions into proper HTTP responses so that
# ~79 router endpoints without per-endpoint try/except still return
# meaningful status codes instead of opaque 500s.

class NotFoundError(ValueError):
    """ValueError subclass that maps to 404 instead of 400."""


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """ValueError → 400 (or 404 for NotFoundError subclass)."""
    is_not_found = isinstance(exc, NotFoundError)
    code = 'NOT_FOUND' if is_not_found else 'INVALID_INPUT'
    status_code = 404 if is_not_found else 400
    logger.warning('ValueError on %s: %s', request.url.path, str(exc)[:200])
    user_msg = 'Resource not found' if is_not_found else 'Invalid input'
    return JSONResponse(
        status_code=status_code,
        content={'detail': {'code': code, 'message': user_msg}},
    )


@app.exception_handler(PermissionError)
async def permission_error_handler(request: Request, exc: PermissionError) -> JSONResponse:
    """PermissionError → 403 Forbidden."""
    logger.warning('PermissionError on %s: %s', request.url.path, str(exc)[:200])
    return JSONResponse(
        status_code=403,
        content={'detail': {'code': 'FORBIDDEN', 'message': 'You do not have permission to perform this action'}},
    )


@app.exception_handler(RequestValidationError)
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all: genuine unexpected errors → 500."""
    logger.error('Unhandled exception: %s', exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={'detail': {'code': 'INTERNAL_ERROR', 'message': 'Internal server error'}},
    )


# CORS — configurable origins (defaults to localhost:3000 in dev)
_cors_origins = [o.strip() for o in settings.cors_origins.split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allow_headers=['Authorization', 'Content-Type'],
)


# Security headers middleware
@app.middleware('http')
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    # Prevent browser/CDN caching of API responses — avoids stale progress data
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
    if not settings.is_dev:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response


# Rewrite /api/ → /api/v1/ for frontend compatibility
app.add_middleware(ApiCompatMiddleware)

# Request logging middleware (outermost — logs after CORS/security rewrites)
app.add_middleware(RequestLogMiddleware)


async def _log_cleanup_loop() -> None:
    """Background task that periodically cleans up old LLM logs."""
    try:
        from app.services.llm_log_service import cleanup_old_logs
    except ImportError:
        logger.info('log_cleanup_skipped_no_module')
        return
    while True:
        await asyncio.sleep(86400)  # 24 hours
        try:
            async with async_session() as db:
                deleted = await cleanup_old_logs(db, settings.llm_log_retention_days)
                if deleted:
                    logger.info('cleaned_up_llm_logs', deleted=deleted, retention_days=settings.llm_log_retention_days)
        except Exception as exc:
            logger.warning('llm_log_cleanup_failed', error=str(exc))


async def _stale_session_cleanup_loop() -> None:
    """Background task that finalizes orphaned reading sessions."""
    while True:
        await asyncio.sleep(7200)  # 2 hours
        try:
            from app.models.reading_session import ReadingSession
            cutoff = utcnow() - timedelta(hours=2)
            async with async_session() as db:
                result = await db.execute(
                    select(ReadingSession).where(
                        ReadingSession.is_active.is_(True),
                        ReadingSession.updated_at < cutoff,
                    ),
                )
                now = utcnow()
                closed = 0
                for session in result.scalars().all():
                    session.is_active = False
                    session.ended_at = now
                    if not session.duration and session.started_at:
                        raw_dur = int((now - session.started_at).total_seconds())
                        session.duration = min(raw_dur, 43200)
                    closed += 1
                if closed:
                    await db.commit()
                    logger.info('closed_stale_sessions', count=closed)
        except Exception as exc:
            logger.warning('stale_session_cleanup_failed', error=str(exc))


async def _fix_absurd_session_durations() -> None:
    """One-time startup fix: cap sessions with durations > 12h to a reasonable max."""
    MAX_SESSION_SECONDS = 43200  # 12 hours
    try:
        from app.models.reading_session import ReadingSession
        async with async_session() as db:
            result = await db.execute(
                select(ReadingSession).where(
                    ReadingSession.duration > MAX_SESSION_SECONDS,
                ),
            )
            fixed = 0
            for session in result.scalars().all():
                old_dur = session.duration
                session.duration = MAX_SESSION_SECONDS
                fixed += 1
            if fixed:
                await db.commit()
                logger.info('fixed_absurd_durations', count=fixed)
    except Exception as exc:
        logger.warning('fix_absurd_durations_failed', error=str(exc))


@app.get('/api/v1/health')
async def health_check() -> dict[str, object]:
    """Health check endpoint — verifies DB and Redis connectivity."""
    checks: dict[str, dict[str, str]] = {}

    try:
        async with async_session() as session:
            await session.execute(text('SELECT 1'))
        checks['database'] = {'status': 'ok'}
    except Exception as exc:
        logger.error('health_check_database_error', error=str(exc))
        checks['database'] = {'status': 'error'}

    try:
        redis = get_redis()
        await redis.ping()
        checks['redis'] = {'status': 'ok'}
    except Exception as exc:
        logger.error('health_check_redis_error', error=str(exc))
        checks['redis'] = {'status': 'error'}

    overall = 'ok' if all(c['status'] == 'ok' for c in checks.values()) else 'degraded'
    return {'status': overall, 'version': '0.1.0', 'checks': checks}


# --- Router includes ---
from app.routers import (
    account,
    agent,
    api_keys,
    annotations,
    auth,
    book_clubs,
    books,
    challenges,
    collections,
    discovery,
    export,
    flashcards,
    friend,
    interventions,
    knowledge,
    logs,
    notifications,
    password_reset,
    reading_book,
    reading_sessions,
    recommendations,
    settings as settings_router,
    share,
    stats,
    study_mode,
    synthesis,
    upload,
    webhooks,
)  # noqa: E402

for r in [
    auth.router,
    password_reset.router,
    account.router,
    agent.router,
    api_keys.router,
    friend.router,
    books.router,
    annotations.router,
    reading_sessions.router,
    settings_router.router,
    knowledge.router,
    logs.router,
    synthesis.router,
    reading_book.router,
    export.router,
    book_clubs.router,
    collections.router,
    flashcards.router,
    notifications.router,
    share.router,
    webhooks.router,
    upload.router,
    stats.router,
    discovery.router,
    challenges.router,
    recommendations.router,
    interventions.router,
    study_mode.router,
]:
    app.include_router(r)

# Strip trailing slashes from all routes AFTER they are registered.
# This prevents 307 redirects when clients call /api/v1/books instead of /api/v1/books/
for route in app.routes:
    if isinstance(route, APIRoute):
        route.path_format = route.path_format.rstrip('/')
        route.path = route.path.rstrip('/')
