"""Annotation CRUD routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.annotation import Annotation
from app.schemas.annotation import (
    AnnotationCreate,
    AnnotationListResponse,
    AnnotationResponse,
    AnnotationUpdate,
    ChapterStatsResponse,
)
from app.services import annotation_service
from app.utils.i18n import _get_user_lang, t

router = APIRouter(prefix='/api/v1/annotations', tags=['annotations'])


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


@router.get('/search')
async def search_annotations(
    q: str = Query(..., min_length=1),
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
        'data': [AnnotationResponse.model_validate(a).model_dump(mode='json') for a in annotations],
        'total': len(annotations),
    }


@router.get('/tags')
async def get_tags(
    bookId: UUID | None = Query(None, alias='bookId'),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get tags with counts for a user's annotations, optionally filtered by book."""
    tag_col = func.unnest(Annotation.tags).label('tag')
    q = (
        select(
            tag_col,
            func.count().label('count'),
        )
        .where(Annotation.user_id == UUID(current_user['id']))
        .group_by(tag_col)
        .order_by(func.count().desc())
    )
    if bookId:
        q = q.where(Annotation.book_id == bookId)
    result = await db.execute(q)
    tags = [{'name': row[0], 'count': row[1]} for row in result.all() if row[0]]
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


@router.get('/{annotation_id}')
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.annotation_not_found', lang)},
        )
    return {
        'success': True,
        'data': AnnotationResponse.model_validate(annotation).model_dump(mode='json'),
    }


@router.post('', status_code=status.HTTP_201_CREATED)
async def create_annotation(
    body: AnnotationCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new annotation."""
    annotation = await annotation_service.create_annotation(
        db, UUID(current_user['id']), body,
    )
    return {
        'success': True,
        'data': AnnotationResponse.model_validate(annotation).model_dump(mode='json'),
    }


@router.patch('/{annotation_id}')
async def update_annotation(
    annotation_id: UUID,
    body: AnnotationUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Partially update an annotation."""
    lang = await _get_user_lang(db, UUID(current_user['id']))
    annotation = await annotation_service.update_annotation(
        db, UUID(current_user['id']), annotation_id, body,
    )
    if annotation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.annotation_not_found', lang)},
        )
    return {
        'success': True,
        'data': AnnotationResponse.model_validate(annotation).model_dump(mode='json'),
    }


@router.delete('/{annotation_id}')
async def delete_annotation(
    annotation_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete an annotation."""
    lang = await _get_user_lang(db, UUID(current_user['id']))
    deleted = await annotation_service.delete_annotation(
        db, UUID(current_user['id']), annotation_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.annotation_not_found', lang)},
        )
    return {'success': True, 'data': {'message': t('errors.annotation_deleted', lang)}}
