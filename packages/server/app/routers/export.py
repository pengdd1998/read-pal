"""Export routes — multi-format annotation export."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.services.export_service import SUPPORTED_FORMATS, export

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

    Supported formats: csv, markdown, html, zotero.
    """
    if format not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                'code': 'INVALID_FORMAT',
                'message': f'Unsupported format: {format}. Use one of: {", ".join(SUPPORTED_FORMATS)}',
            },
        )

    result = await export(db, UUID(current_user['id']), book_id, format)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'Book not found'},
        )

    content, content_type = result

    filename_map = {
        'csv': f'annotations-{book_id}.csv',
        'markdown': f'annotations-{book_id}.md',
        'html': f'annotations-{book_id}.html',
        'zotero': f'annotations-{book_id}.rdf',
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
