"""File upload router."""

import html
import os
import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.common import GenericResponse
from app.middleware.rate_limiter import upload_limiter
from app.services.upload_service import (
    MAX_FILE_SIZE,
    create_book_with_content,
    get_book_content as svc_get_book_content,
    get_file_type,
    validate_file,
)
from app.utils.i18n import _get_user_lang, t

router = APIRouter(prefix='/api/v1/upload', tags=['upload'])


@router.post('', status_code=status.HTTP_201_CREATED, response_model=GenericResponse, dependencies=[upload_limiter])
async def upload_book(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    title: str | None = None,
    author: str | None = None,
    tags: str | None = None,
) -> dict:
    """Upload an EPUB or PDF file and create a book record."""
    lang = await _get_user_lang(db, UUID(user['id']))
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'VALIDATION_ERROR', 'message': t('errors.no_filename', lang)},
        )

    file_size = 0
    error = validate_file(file.filename, 0, lang)
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'VALIDATION_ERROR', 'message': error},
        )

    file_type = get_file_type(file.filename)
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{file_type}') as tmp:
            tmp_path = tmp.name
            while chunk := await file.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail={'code': 'FILE_TOO_LARGE', 'message': t('errors.file_too_large_mb', lang, max_size=MAX_FILE_SIZE // (1024 * 1024))},
                    )
                tmp.write(chunk)

        error = validate_file(file.filename, file_size, lang)
        if error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={'code': 'VALIDATION_ERROR', 'message': error},
            )

        book_title = title or html.escape(Path(file.filename).stem)
        book_author = author or 'Unknown'
        tag_list = tags.split(',') if tags else []

        book = await create_book_with_content(
            db=db,
            user_id=UUID(user['id']),
            title=book_title,
            author=book_author,
            file_type=file_type,
            file_size=file_size,
            file_path=tmp_path,
            tags=tag_list,
        )

        return {
            'success': True,
            'data': {
                'book': {
                    'id': str(book.id),
                    'title': book.title,
                    'author': book.author,
                    'fileType': book.file_type.value,
                    'totalPages': book.total_pages,
                    'status': book.status.value,
                },
            },
        }
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


@router.get('/books/{book_id}/content', response_model=GenericResponse)
async def get_book_content(
    book_id: UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get book content (raw text/chapters)."""
    lang = await _get_user_lang(db, UUID(user['id']))
    data = await svc_get_book_content(db, UUID(user['id']), book_id, lang)
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found', lang)},
        )
    return {'success': True, 'data': data}
