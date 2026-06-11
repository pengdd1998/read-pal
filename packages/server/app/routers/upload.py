"""File upload router."""

import html
import logging
import os
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
    stream_upload_to_tempfile,
    validate_file,
)
from app.utils.i18n import _get_user_lang, not_found_error, t
from app.middleware.rate_limiter import api_limiter

logger = logging.getLogger('read-pal.upload')

router = APIRouter(prefix='/api/v1/upload', tags=['upload'], dependencies=[api_limiter])


def _validate_upload_file(
    filename: str | None,
    file_size: int,
    lang: str,
) -> tuple[str, str | None]:
    """Validate filename and size, returning (file_type, error_detail or None)."""
    if not filename:
        return '', t('errors.no_filename', lang)
    error = validate_file(filename, file_size, lang)
    if error:
        return '', error
    return get_file_type(filename), None


def _build_book_response(book: object) -> dict:
    """Build the success response dict from a book ORM object."""
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


async def _stream_and_validate(
    file: UploadFile,
    filename: str | None,
    lang: str,
) -> tuple[str, int]:
    """Stream upload to temp file and validate; return (tmp_path, file_size)."""
    try:
        tmp_path, file_size = await stream_upload_to_tempfile(file)
    except ValueError:
        logger.debug('validation error in upload')
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                'code': 'FILE_TOO_LARGE',
                'message': t(
                    'errors.file_too_large_mb', lang,
                    max_size=MAX_FILE_SIZE // (1024 * 1024),
                ),
            },
        )

    error = validate_file(filename, file_size, lang)
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'VALIDATION_ERROR', 'message': error},
        )
    return tmp_path, file_size


async def _process_upload(
    db: AsyncSession,
    user_id: UUID,
    file: UploadFile,
    file_type: str,
    title: str | None,
    author: str | None,
    tags: str | None,
    lang: str,
) -> tuple[str | None, dict]:
    """Stream file to temp, create book, return (tmp_path, response_dict)."""
    tmp_path, file_size = await _stream_and_validate(file, file.filename, lang)

    book_title = title or html.escape(Path(file.filename).stem)
    book_author = author or ''
    tag_list = tags.split(',') if tags else []

    book = await create_book_with_content(
        db=db,
        user_id=user_id,
        title=book_title,
        author=book_author,
        file_type=file_type,
        file_size=file_size,
        file_path=tmp_path,
        tags=tag_list,
    )
    return tmp_path, _build_book_response(book)


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
    file_type, error = _validate_upload_file(file.filename, 0, lang)
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'VALIDATION_ERROR', 'message': error},
        )

    tmp_path: str | None = None
    try:
        tmp_path, result = await _process_upload(
            db, UUID(user['id']), file, file_type, title, author, tags, lang,
        )
        return result
    except HTTPException:
        raise
    except (ValueError, OSError, KeyError, RuntimeError) as exc:
        logger.warning('upload.parse_failed user=%s file=%s error=%s', user['id'], file.filename, exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={'code': 'PARSE_ERROR', 'message': t('errors.parse_failed', lang, filename=file.filename)},
        ) from exc
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                logger.debug('upload.temp_cleanup_failed path=%s', tmp_path)


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
        raise not_found_error(t('errors.book_not_found', lang))
    return {'success': True, 'data': data}
