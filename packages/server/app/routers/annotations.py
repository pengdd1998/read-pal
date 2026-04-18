"""Annotation CRUD routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.annotation import (
    AnnotationCreate,
    AnnotationListResponse,
    AnnotationResponse,
    AnnotationUpdate,
    ChapterStatsResponse,
)
from app.services import annotation_service

router = APIRouter(prefix='/api/v1/annotations', tags=['annotations'])


@router.get('/', response_model=AnnotationListResponse)
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
        current_user['id'],
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
        current_user['id'],
        q,
        book_id=book_id,
    )
    return {
        'success': True,
        'data': [AnnotationResponse.model_validate(a).model_dump(mode='json') for a in annotations],
        'total': len(annotations),
    }


@router.get('/stats/chapters', response_model=ChapterStatsResponse)
async def get_chapter_stats(
    book_id: UUID = Query(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChapterStatsResponse:
    """Return annotation stats grouped by chapter for a book."""
    stats = await annotation_service.get_chapter_stats(
        db,
        current_user['id'],
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
    annotation = await annotation_service.get_annotation(
        db, current_user['id'], annotation_id,
    )
    if annotation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'Annotation not found'},
        )
    return {
        'success': True,
        'data': AnnotationResponse.model_validate(annotation).model_dump(mode='json'),
    }


@router.post('/', status_code=status.HTTP_201_CREATED)
async def create_annotation(
    body: AnnotationCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new annotation."""
    annotation = await annotation_service.create_annotation(
        db, current_user['id'], body,
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
    annotation = await annotation_service.update_annotation(
        db, current_user['id'], annotation_id, body,
    )
    if annotation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'Annotation not found'},
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
    deleted = await annotation_service.delete_annotation(
        db, current_user['id'], annotation_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'Annotation not found'},
        )
    return {'success': True, 'data': {'message': 'Annotation deleted successfully'}}
