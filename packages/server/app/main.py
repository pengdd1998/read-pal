import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import get_settings

logger = logging.getLogger('read-pal')
settings = get_settings()


class ApiCompatMiddleware(BaseHTTPMiddleware):
    """Rewrite /api/ requests to /api/v1/ for frontend compatibility.

    The frontend currently calls /api/books, /api/auth/login, etc.
    The Python backend uses /api/v1/books, /api/v1/auth/login, etc.
    This middleware bridges the gap during migration.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if (
            path.startswith('/api/')
            and not path.startswith('/api/v1/')
            and not path.startswith('/api/docs')
            and not path.startswith('/api/openapi')
        ):
            new_path = path.replace('/api/', '/api/v1/', 1)
            request.scope['path'] = new_path
            request.scope['raw_path'] = new_path.encode()
        return await call_next(request)


app = FastAPI(
    title='Read-Pal API',
    version='0.1.0',
    docs_url='/api/v1/docs',
    openapi_url='/api/v1/openapi.json',
)

# CORS — allow all origins in development
if settings.is_dev:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

# Rewrite /api/ → /api/v1/ for frontend compatibility
app.add_middleware(ApiCompatMiddleware)


@app.on_event('startup')
async def startup() -> None:
    """Run on application startup."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
    )
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


@app.get('/api/v1/health')
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {'status': 'ok', 'version': '0.1.0'}


# --- Router includes ---
from app.routers import (
    agent,
    annotations,
    auth,
    book_clubs,
    books,
    collections,
    export,
    flashcards,
    friend,
    knowledge,
    notifications,
    reading_book,
    reading_sessions,
    settings as settings_router,
    share,
    synthesis,
    upload,
    webhooks,
)  # noqa: E402

for r in [
    auth.router,
    agent.router,
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
]:
    app.include_router(r)
