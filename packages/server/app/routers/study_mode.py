"""Study mode routes — objectives, concept checks, mastery tracking."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.services.study_mode_service import (
    generate_concept_checks as svc_generate_checks,
    generate_objectives as svc_generate_objectives,
    get_mastery as svc_get_mastery,
    save_checks_as_flashcards,
)
from app.utils.i18n import t

logger = logging.getLogger('read-pal.study')

router = APIRouter(prefix='/api/v1/study-mode', tags=['study-mode'])


@router.post('/objectives')
async def generate_objectives(
    body: dict,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Generate study objectives for a chapter using LLM."""
    data = await svc_generate_objectives(
        book_id=body.get('bookId') or body.get('book_id'),
        chapter_title=body.get('chapterTitle') or body.get('chapter_title') or 'this chapter',
        chapter_index=(
            body.get('chapterIndex')
            if body.get('chapterIndex') is not None
            else body.get('chapter_index')
        ),
    )
    return {'success': True, 'data': data}


@router.post('/concept-checks')
async def generate_concept_checks(
    body: dict,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Generate concept check questions with answers and hints."""
    data = await svc_generate_checks(
        book_id=body.get('bookId') or body.get('book_id'),
        chapter_title=body.get('chapterTitle') or body.get('chapter_title') or 'this chapter',
        chapter_index=(
            body.get('chapterIndex')
            if body.get('chapterIndex') is not None
            else body.get('chapter_index')
        ),
        chapter_content=body.get('chapterContent') or body.get('chapter_content') or '',
    )
    return {'success': True, 'data': data}


@router.post('/save-checks')
async def save_concept_checks(
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Save concept check results as flashcards for spaced repetition."""
    user_id = UUID(current_user['id'])
    book_id = body.get('bookId') or body.get('book_id')
    checks = body.get('checks', [])

    saved = await save_checks_as_flashcards(db, user_id, book_id, checks)
    logger.info('Saved %d concept checks for book %s', saved, book_id)

    return {'success': True, 'data': {'message': t('errors.results_saved')}}


@router.get('/mastery/{book_id}')
async def get_mastery(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return mastery data for a book based on progress and flashcard reviews."""
    user_id = UUID(current_user['id'])
    data = await svc_get_mastery(db, user_id, book_id)
    return {'success': True, 'data': data}
