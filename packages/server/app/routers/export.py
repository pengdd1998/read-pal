"""Export routes — multi-format annotation export."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.services.export_service import CITATION_FORMATS, SUPPORTED_FORMATS, export
from app.utils.i18n import t

logger = logging.getLogger('read-pal.export')

router = APIRouter(prefix='/api/v1/export', tags=['export'])


@router.get('/{book_id}/{format}')
async def export_annotations(
    book_id: UUID,
    format: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export annotations for a book in the specified format.

    Supported formats: csv, markdown, html, zotero, apa, mla, chicago.
    """
    all_formats = SUPPORTED_FORMATS + CITATION_FORMATS
    if format not in all_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                'code': 'INVALID_FORMAT',
                'message': t('errors.unsupported_format', format=format, formats=', '.join(all_formats)),
            },
        )

    result = await export(db, UUID(current_user['id']), book_id, format)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found')},
        )

    content, content_type = result

    filename_map = {
        'csv': f'annotations-{book_id}.csv',
        'markdown': f'annotations-{book_id}.md',
        'html': f'annotations-{book_id}.html',
        'zotero': f'annotations-{book_id}.rdf',
        'apa': f'citation-{book_id}.txt',
        'mla': f'citation-{book_id}.txt',
        'chicago': f'citation-{book_id}.txt',
    }

    return Response(
        content=content,
        media_type=content_type,
        headers={
            'Content-Disposition': (
                f'attachment; filename="{filename_map[format]}"'
            ),
        },
    )


@router.get('')
async def export_by_query_params(
    bookId: UUID = Query(..., alias='bookId'),
    format: str = Query(..., alias='format'),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export annotations using query params (frontend compatibility).

    Query params: ``?bookId=...&format=...``
    """
    all_formats = SUPPORTED_FORMATS + CITATION_FORMATS
    if format not in all_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                'code': 'INVALID_FORMAT',
                'message': t('errors.unsupported_format', format=format, formats=', '.join(all_formats)),
            },
        )

    result = await export(db, UUID(current_user['id']), bookId, format)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found')},
        )

    content, content_type = result

    filename_map = {
        'csv': f'annotations-{bookId}.csv',
        'markdown': f'annotations-{bookId}.md',
        'html': f'annotations-{bookId}.html',
        'zotero': f'annotations-{bookId}.rdf',
        'apa': f'citation-{bookId}.txt',
        'mla': f'citation-{bookId}.txt',
        'chicago': f'citation-{bookId}.txt',
    }

    return Response(
        content=content,
        media_type=content_type,
        headers={
            'Content-Disposition': (
                f'attachment; filename="{filename_map[format]}"'
            ),
        },
    )
