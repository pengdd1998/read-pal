"""Agent service — shared helpers for agent router handlers.

Keeps the router thin by extracting repeated patterns:
- SSE bytes wrapping with error handling
- ValueError → HTTPException translation
- User language resolution
"""

from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import companion_service
from app.utils.i18n import DEFAULT_LANGUAGE, _get_user_lang, translate_error, t


async def resolve_lang(db: AsyncSession, user_id: UUID) -> str:
    """Get the user's language preference."""
    return await _get_user_lang(db, user_id)


def raise_not_found(exc: ValueError, lang: str = DEFAULT_LANGUAGE) -> None:
    """Convert a service ValueError into an HTTP 404."""
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={'code': 'NOT_FOUND', 'message': translate_error(exc, lang)},
    ) from exc


async def sse_bytes_stream(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    persona: str | None = None,
    lang: str = DEFAULT_LANGUAGE,
) -> AsyncGenerator[bytes, None]:
    """Wrap companion_service.stream_chat as a bytes SSE generator.

    Handles ValueError and unexpected exceptions, yielding SSE-formatted
    error frames so the client always gets a clean stream termination.
    """
    import logging

    logger = logging.getLogger('read-pal.agent')
    try:
        async for chunk in companion_service.stream_chat(
            db, user_id, book_id, message, context=context,
            companion_mode=companion_mode, persona=persona, lang=lang,
        ):
            yield chunk.encode('utf-8')
    except ValueError as exc:
        error_msg = f'data: {{"error": "{exc}"}}\n\n'
        yield error_msg.encode('utf-8')
    except Exception:
        logger.exception('Streaming error in agent chat')
        internal_msg = t('errors.internal_error')
        error_msg = f'data: {{"error": "{internal_msg}"}}\n\n'
        yield error_msg.encode('utf-8')
