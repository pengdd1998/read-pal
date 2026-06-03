"""Synthesis routes — cross-reference analysis of reading data."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter
from app.schemas.common import GenericResponse
from app.schemas.synthesis import CompareRequest, SynthesisRequest
from app.services.synthesis_service import compare_books, cross_book_synthesize, get_user_book_ids, synthesize
from app.utils.i18n import t

logger = logging.getLogger('read-pal.synthesis')

router = APIRouter(prefix='/api/v1/synthesis', tags=['synthesis'])


@router.post('/{book_id}', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def run_synthesis(
    book_id: UUID,
    body: SynthesisRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Run synthesis analysis for a book."""
    include_highlights = body.include_highlights if body else True
    include_notes = body.include_notes if body else True
    include_conversations = body.include_conversations if body else True

    response = await synthesize(
        db,
        UUID(current_user['id']),
        book_id,
        include_highlights=include_highlights,
        include_notes=include_notes,
        include_conversations=include_conversations,
    )

    if not response.success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found')},
        )

    return {
        'success': True,
        'data': response.data,
    }


@router.get('/cross-book', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
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

    response = await cross_book_synthesize(
        db,
        UUID(current_user['id']),
        book_ids,
    )

    return {
        'success': True,
        'data': response.data,
    }


@router.post('/cross-book/compare', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def run_book_comparison(
    body: CompareRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Compare two books — find common themes, unique perspectives, and connections."""
    response = await compare_books(
        db,
        UUID(current_user['id']),
        body.book_id_1,
        body.book_id_2,
    )

    if not response.success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found')},
        )

    return {
        'success': True,
        'data': response.data,
    }
