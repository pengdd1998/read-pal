"""Export routes — multi-format annotation export."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import api_limiter
from app.services.export_service import CITATION_FORMATS, SUPPORTED_FORMATS, export
from app.utils.i18n import t

logger = logging.getLogger('read-pal.export')

router = APIRouter(
    prefix='/api/v1/export',
    tags=['export'],
    dependencies=[api_limiter],
)

_FILENAME_MAP = {
    'csv': 'annotations-{book_id}.csv',
    'markdown': 'annotations-{book_id}.md',
    'html': 'annotations-{book_id}.html',
    'zotero': 'annotations-{book_id}.rdf',
    'apa': 'citation-{book_id}.txt',
    'mla': 'citation-{book_id}.txt',
    'chicago': 'citation-{book_id}.txt',
    'bibtex': 'citation-{book_id}.bib',
}


def _validate_format(fmt: str) -> None:
    """Raise 400 if format is unsupported."""
    all_formats = SUPPORTED_FORMATS + CITATION_FORMATS
    if fmt not in all_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                'code': 'INVALID_FORMAT',
                'message': t('errors.unsupported_format', format=fmt, formats=', '.join(all_formats)),
            },
        )


async def _do_export(db: AsyncSession, user_id: UUID, book_id: UUID, fmt: str) -> Response:
    """Shared export logic: validate, call service, build response."""
    _validate_format(fmt)

    result = await export(db, user_id, book_id, fmt)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found')},
        )

    content, content_type = result
    filename = _FILENAME_MAP[fmt].format(book_id=book_id)

    return Response(
        content=content,
        media_type=content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
        },
    )


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
    return await _do_export(db, UUID(current_user['id']), book_id, format)


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
    return await _do_export(db, UUID(current_user['id']), bookId, format)
