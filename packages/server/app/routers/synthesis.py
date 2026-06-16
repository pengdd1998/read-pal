"""Synthesis routes — cross-reference analysis of reading data."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.idempotency import idempotent
from app.middleware.rate_limiter import ai_heavy_limiter, write_limiter
from app.middleware.daily_llm_budget import daily_ai_budget
from app.schemas.common import GenericResponse
from app.schemas.synthesis import CompareRequest, SynthesisRequest
from app.services.cross_book_synthesis_service import (
    compare_books,
    cross_book_synthesize,
    get_user_book_ids,
)
from app.services.synthesis_service import synthesize
from app.utils.i18n import not_found_error, t
from app.middleware.rate_limiter import api_limiter

logger = logging.getLogger('read-pal.synthesis')

router = APIRouter(prefix='/api/v1/synthesis', tags=['synthesis'], dependencies=[api_limiter])


@router.post('/{book_id}', response_model=GenericResponse, dependencies=[ai_heavy_limiter, write_limiter, daily_ai_budget, idempotent])
async def run_synthesis(
    request: Request,  # populated by idempotent dependency
    book_id: UUID,
    body: SynthesisRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Run synthesis analysis for a book."""
    from app.middleware.idempotency import check_idempotency_cache, store_idempotency_response
    cached = await check_idempotency_cache(request)
    if cached is not None:
        return cached

    include_highlights = body.include_highlights if body else True
    include_notes = body.include_notes if body else True
    include_conversations = body.include_conversations if body else True

    try:
        response = await synthesize(
            db,
            UUID(current_user['id']),
            book_id,
            include_highlights=include_highlights,
            include_notes=include_notes,
            include_conversations=include_conversations,
        )
    except ValueError as exc:
        raise not_found_error(str(exc)) from exc
    except Exception as exc:
        logger.warning('synthesis failed user=%s book=%s', current_user['id'], book_id, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'code': 'AI_UNAVAILABLE', 'message': t('errors.ai_service_unavailable')},
        ) from exc

    # Service uses success=False for both "book not found" (no error field)
    # and "LLM fallback" (error field set, partial data still useful).
    # Pass through LLM fallback as success=True with embedded data.error so
    # the frontend can render the warning instead of an opaque 404.
    if not response.success and response.error is None:
        raise not_found_error(t('errors.book_not_found'))

    payload = {
        'success': True,
        'data': response.data,
    }
    await store_idempotency_response(request, payload)
    return payload


@router.get('/cross-book', response_model=GenericResponse, dependencies=[ai_heavy_limiter, daily_ai_budget])
async def run_cross_book_synthesis(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Run cross-book synthesis across all user's books.

    Finds common themes, contrasting viewpoints, and connections between books.
    """
    book_ids = await get_user_book_ids(db, UUID(current_user['id']))

    if not book_ids:
        return {
            'success': True,
            'data': {
                'themes': [],
                'connections': [],
                'book_summaries': [],
            },
        }

    try:
        response = await cross_book_synthesize(
            db,
            UUID(current_user['id']),
            book_ids,
        )
    except Exception as exc:
        logger.warning('cross-book synthesis failed user=%s', current_user['id'], exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'code': 'AI_UNAVAILABLE', 'message': t('errors.ai_service_unavailable')},
        ) from exc

    return {
        'success': True,
        'data': response.data,
    }


@router.post('/cross-book/compare', response_model=GenericResponse, dependencies=[ai_heavy_limiter, write_limiter, daily_ai_budget, idempotent])
async def run_book_comparison(
    body: CompareRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Compare two books — find common themes, unique perspectives, and connections."""
    try:
        response = await compare_books(
            db,
            UUID(current_user['id']),
            body.book_id_1,
            body.book_id_2,
        )
    except ValueError as exc:
        raise not_found_error(str(exc)) from exc
    except Exception as exc:
        logger.warning('book comparison failed user=%s', current_user['id'], exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'code': 'AI_UNAVAILABLE', 'message': t('errors.ai_service_unavailable')},
        ) from exc

    # Service uses success=False for both "book not found" (no error field)
    # and "LLM fallback" (error field set, partial data still useful).
    # Pass through LLM fallback as success=True with embedded data.error so
    # the frontend can render the warning instead of an opaque 404.
    if not response.success and response.error is None:
        raise not_found_error(t('errors.book_not_found'))

    return {
        'success': True,
        'data': response.data,
    }
