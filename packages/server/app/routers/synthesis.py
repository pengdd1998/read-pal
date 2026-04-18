"""Synthesis routes — cross-reference analysis of reading data."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.book import Book
from app.schemas.synthesis import SynthesisRequest, SynthesisResponse
from app.services.synthesis_service import cross_book_synthesize, synthesize

logger = logging.getLogger('read-pal.synthesis')

router = APIRouter(prefix='/api/v1/synthesis', tags=['synthesis'])


@router.post('/{book_id}')
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
            detail={'code': 'NOT_FOUND', 'message': 'Book not found'},
        )

    return {
        'success': True,
        'data': response.data,
    }


@router.get('/cross-book')
async def run_cross_book_synthesis(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Run cross-book synthesis across all user's books.

    Finds common themes, contrasting viewpoints, and connections between books.
    """
    result = await db.execute(
        select(Book.id).where(Book.user_id == UUID(current_user['id'])),
    )
    book_ids = [row[0] for row in result.all()]

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
