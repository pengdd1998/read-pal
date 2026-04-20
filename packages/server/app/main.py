import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.config import get_settings

logger = logging.getLogger('read-pal')
settings = get_settings()


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


app = FastAPI(
    title='Read-Pal API',
    version='0.1.0',
    docs_url='/api/v1/docs',
    openapi_url='/api/v1/openapi.json',
    redirect_slashes=True,
)

# Global exception handler — always return JSON, never plain text
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
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
    if not settings.is_dev:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response


# Rewrite /api/ → /api/v1/ for frontend compatibility
app.add_middleware(ApiCompatMiddleware)


@app.on_event('startup')
async def startup() -> None:
    """Run on application startup."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
    )
    from app.utils.i18n import load_translations
    load_translations()
    logger.info(
        'Read-Pal API starting — env=%s, model=%s',
        settings.app_env,
        settings.default_model,
    )

    if settings.is_dev:
        try:
            from app.db import init_db
            await init_db()
            logger.info('Database tables created (dev mode)')
        except Exception as exc:
            logger.warning('Could not auto-create tables: %s', exc)


@app.on_event('shutdown')
async def shutdown() -> None:
    """Clean up resources on application shutdown."""
    from app.services.llm import shutdown_llm
    await shutdown_llm()


@app.get('/api/v1/health')
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {'status': 'ok', 'version': '0.1.0'}


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
