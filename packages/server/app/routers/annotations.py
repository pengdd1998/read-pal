"""Annotation CRUD routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import write_limiter
from app.schemas.annotation import (
    AnnotationCreate,
    AnnotationListResponse,
    AnnotationResponse,
    AnnotationUpdate,
    ChapterStatsResponse,
)
from app.schemas.common import GenericResponse
from app.services import annotation_service
from app.utils.i18n import _get_user_lang, not_found_error, t
from app.utils.sanitizer import sanitize_annotation_fields
from app.middleware.rate_limiter import api_limiter

logger = logging.getLogger('read-pal.annotations')

router = APIRouter(prefix='/api/v1/annotations', tags=['annotations'], dependencies=[api_limiter])


@router.get('', response_model=AnnotationListResponse)
async def list_annotations(
    book_id: UUID | None = Query(None),
    type: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnnotationListResponse:
    """List annotations with optional book and type filters."""
    annotations, total = await annotation_service.get_annotations(
        db,
        UUID(current_user['id']),
        book_id=book_id,
        type=type,
        page=page,
        per_page=per_page,
    )
    return AnnotationListResponse(
        data=[AnnotationResponse.model_validate(a) for a in annotations],
        total=total,
    )


@router.get('/search', response_model=GenericResponse)
async def search_annotations(
    q: str = Query(..., min_length=1, max_length=200),
    book_id: UUID | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Search annotations by content or note text."""
    annotations = await annotation_service.search_annotations(
        db,
        UUID(current_user['id']),
        q,
        book_id=book_id,
    )
    return {
        'success': True,
        'data': {
            'items': [AnnotationResponse.model_validate(a).model_dump(mode='json', by_alias=True) for a in annotations],
            'total': len(annotations),
        },
    }


@router.get('/tags', response_model=GenericResponse)
async def get_tags(
    bookId: UUID | None = Query(None, alias='bookId'),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get tags with counts for a user's annotations, optionally filtered by book."""
    tags = await annotation_service.get_tags(
        db,
        UUID(current_user['id']),
        book_id=bookId,
    )
    return {'success': True, 'data': tags}


@router.get('/stats/chapters', response_model=ChapterStatsResponse)
async def get_chapter_stats(
    book_id: UUID = Query(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChapterStatsResponse:
    """Return annotation stats grouped by chapter for a book."""
    stats = await annotation_service.get_chapter_stats(
        db,
        UUID(current_user['id']),
        book_id,
    )
    return ChapterStatsResponse(data=stats)


@router.get('/{annotation_id}', response_model=GenericResponse)
async def get_annotation(
    annotation_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a single annotation by ID."""
    lang = await _get_user_lang(db, UUID(current_user['id']))
    annotation = await annotation_service.get_annotation(
        db, UUID(current_user['id']), annotation_id,
    )
    if annotation is None:
        raise not_found_error(t('errors.annotation_not_found', lang))
    return {
        'success': True,
        'data': AnnotationResponse.model_validate(annotation).model_dump(mode='json', by_alias=True),
    }


@router.post('', status_code=status.HTTP_201_CREATED, response_model=GenericResponse, dependencies=[write_limiter])
async def create_annotation(
    body: AnnotationCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new annotation."""
    # XSS prevention: strip HTML from user-supplied fields
    body_dict = body.model_dump()
    sanitize_annotation_fields(body_dict)
    body = AnnotationCreate(**body_dict)
    try:
        annotation = await annotation_service.create_annotation(
            db, UUID(current_user['id']), body,
        )
    except ValueError:
        logger.debug('validation error in annotations')
        raise not_found_error('Annotation not found') from None
    return {
        'success': True,
        'data': AnnotationResponse.model_validate(annotation).model_dump(mode='json', by_alias=True),
    }


@router.patch('/{annotation_id}', response_model=GenericResponse, dependencies=[write_limiter])
async def update_annotation(
    annotation_id: UUID,
    body: AnnotationUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Partially update an annotation."""
    lang = await _get_user_lang(db, UUID(current_user['id']))
    # XSS prevention: strip HTML from user-supplied fields
    body_dict = body.model_dump(exclude_unset=True)
    sanitize_annotation_fields(body_dict)
    body = AnnotationUpdate(**body_dict)
    annotation = await annotation_service.update_annotation(
        db, UUID(current_user['id']), annotation_id, body,
    )
    if annotation is None:
        raise not_found_error(t('errors.annotation_not_found', lang))
    return {
        'success': True,
        'data': AnnotationResponse.model_validate(annotation).model_dump(mode='json', by_alias=True),
    }


@router.delete('/{annotation_id}', status_code=status.HTTP_204_NO_CONTENT, dependencies=[write_limiter])
async def delete_annotation(
    annotation_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an annotation."""
    lang = await _get_user_lang(db, UUID(current_user['id']))
    deleted = await annotation_service.delete_annotation(
        db, UUID(current_user['id']), annotation_id,
    )
    if not deleted:
        raise not_found_error(t('errors.annotation_not_found', lang))
