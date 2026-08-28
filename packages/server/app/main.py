import asyncio
import os
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
from starlette.responses import Response as StarletteResponse

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.config import get_settings
from app.core.logging import setup_logging
from app.core.redis import get_redis
from app.db import async_session, pool_status
from app.middleware.exception_handlers import register_exception_handlers
from app.middleware.request_log import RequestLogMiddleware

logger = structlog.get_logger('read-pal')
settings = get_settings()

_is_production = os.getenv('APP_ENV', 'development') == 'production'


class ApiCompatMiddleware:
    """Pure ASGI middleware — rewrites paths without breaking CORS.

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

            if (
                path.startswith('/api/')
                and not path.startswith('/api/v1/')
                and not path.startswith('/api/docs')
                and not path.startswith('/api/openapi')
            ):
                path = path.replace('/api/', '/api/v1/', 1)

            for old_prefix, new_prefix in self._PATH_REWRITES:
                if path.startswith(old_prefix):
                    path = path.replace(old_prefix, new_prefix, 1)
                    break

            scope['path'] = path
            scope['raw_path'] = path.encode()

        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup + shutdown."""
    is_prod = os.getenv('APP_ENV', 'development') == 'production'
    setup_logging(level=settings.log_level, json_output=is_prod or settings.log_json)
    from app.utils.i18n import load_translations
    load_translations()
    logger.info('api_starting', env=settings.app_env, model=settings.default_model)

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
        except DBAPIError as exc:
            logger.warning('auto_create_tables_failed', error=str(exc))

    from app.core.background_tasks import (
        log_cleanup_loop, stale_session_cleanup_loop, fix_absurd_session_durations,
    )
    asyncio.create_task(log_cleanup_loop())
    asyncio.create_task(stale_session_cleanup_loop())
    await fix_absurd_session_durations()

    from app.services.llm import _trace_writer
    _trace_writer.start()
    logger.info('LLM trace writer started')

    yield

    # P4.1: Flush trace writer on shutdown so up to 50 buffered traces don't
    # get lost on clean deploys / restarts.
    from app.services.llm import shutdown_llm, _trace_writer
    from app.core.redis import close_redis
    try:
        flushed = await _trace_writer.flush()
        logger.info('LLM trace writer flushed %d records on shutdown', flushed)
    except Exception as exc:  # noqa: BLE001 — best-effort flush
        logger.warning('LLM trace writer flush failed on shutdown: %s', str(exc)[:200])
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

# Structured exception handlers
register_exception_handlers(app)

# CORS
_cors_origins = [o.strip() for o in settings.cors_origins.split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allow_headers=['Authorization', 'Content-Type'],
)


# Security headers
@app.middleware('http')
async def add_security_headers(request: Request, call_next: Callable[[Request], Awaitable[StarletteResponse]]) -> StarletteResponse:
    response = await call_next(request)
    # Suppress server identification (L5)
    if 'server' in response.headers:
        del response.headers['server']
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # CSP for API responses — restrictive; front-end sets its own via meta tag
    if request.url.path.startswith('/api/'):
        response.headers['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'none'"
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
    if not settings.is_dev:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response


app.add_middleware(ApiCompatMiddleware)
app.add_middleware(RequestLogMiddleware)


# --- Body size limit (M6) ----------------------------------------------------
_MAX_BODY_BYTES = 10 * 1024 * 1024  # 10 MB


class BodySizeLimitMiddleware:
    """Pure ASGI middleware — rejects request bodies exceeding the size limit."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return

        headers = dict((k.decode().lower(), v.decode()) for k, v in scope.get('headers', []))
        content_length = int(headers.get('content-length', 0))
        if content_length > _MAX_BODY_BYTES:
            await send({
                'type': 'http.response.start',
                'status': 413,
                'headers': [[b'content-type', b'application/json']],
            })
            body = b'{"detail":{"code":"PAYLOAD_TOO_LARGE","message":"Request body exceeds size limit"}}'
            await send({'type': 'http.response.body', 'body': body})
            return

        await self.app(scope, receive, send)


app.add_middleware(BodySizeLimitMiddleware)


@app.get('/api/v1/health')
async def health_check() -> dict[str, object]:
    """Health check — verifies DB and Redis connectivity."""
    checks: dict[str, dict[str, str]] = {}

    try:
        async with async_session() as session:
            await session.execute(text('SELECT 1'))
        checks['database'] = {'status': 'ok'}
    except DBAPIError as exc:
        logger.error('health_check_database_error', error=str(exc))
        checks['database'] = {'status': 'error'}
    except (OSError, ConnectionError, ValueError) as exc:
        # Unreachable DB surfaces as OSError from asyncpg before SQLAlchemy
        # wraps it — health must degrade, not 500 (CI has no database).
        logger.error('health_check_database_unreachable', error=str(exc)[:200])
        checks['database'] = {'status': 'error'}

    try:
        redis = get_redis()
        await redis.ping()
        checks['redis'] = {'status': 'ok'}
    except (redis.exceptions.RedisError, ConnectionError) as exc:
        logger.error('health_check_redis_error', error=str(exc))
        checks['redis'] = {'status': 'error'}

    overall = 'ok' if all(c['status'] == 'ok' for c in checks.values()) else 'degraded'
    return {'status': overall, 'version': '0.1.0', 'checks': checks, 'db_pool': pool_status()}


# --- Router includes ---
from app.routers import (  # noqa: E402
    account, agent, annotations, auth, book_clubs, books,
    challenges, collections, discovery, export, flashcards, friend,
    interventions, knowledge, llm_providers, logs, notifications,
    password_reset, reading_book, reading_sessions, recommendations,
    settings as settings_router, share, stats, study_mode, synthesis,
    upload, webhooks,
)

for r in [
    auth.router, password_reset.router, account.router, agent.router,
    friend.router, books.router, annotations.router,
    reading_sessions.router, settings_router.router, knowledge.router,
    logs.router, synthesis.router, reading_book.router, export.router,
    book_clubs.router, collections.router, flashcards.router,
    notifications.router, share.router, webhooks.router, upload.router,
    stats.router, discovery.router, challenges.router,
    recommendations.router, interventions.router, study_mode.router,
    llm_providers.router,
]:
    app.include_router(r)

# Strip trailing slashes to prevent 307 redirects
for route in app.routes:
    if isinstance(route, APIRoute):
        route.path_format = route.path_format.rstrip('/')
        route.path = route.path.rstrip('/')
