"""File upload router."""

import logging
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.book import BookResponse
from app.schemas.common import GenericResponse
from app.middleware.rate_limiter import upload_limiter, write_limiter
from app.services.upload_service import (
    MAX_FILE_SIZE,
    create_book_with_content,
    find_existing_book_by_hash,
    get_book_content as svc_get_book_content,
    get_file_type,
    stream_upload_to_tempfile,
    validate_file,
)
from app.utils.i18n import _get_user_lang, not_found_error, t
from app.utils.sanitizer import strip_html
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
    """Build the success response dict from a book ORM object.

    Returns the full BookResponse shape (coverUrl, progress, tags, dates, …)
    so the freshly-uploaded card renders immediately — including its cover —
    instead of showing the gradient placeholder until the library re-fetches.
    """
    book_data = BookResponse.model_validate(book).model_dump(by_alias=True, mode='json')
    return {'success': True, 'data': {'book': book_data}}


async def _stream_and_validate(
    file: UploadFile,
    filename: str | None,
    lang: str,
) -> tuple[str, int, str]:
    """Stream upload to temp file and validate.

    Returns (tmp_path, file_size, content_hash).
    """
    try:
        tmp_path, file_size, content_hash = await stream_upload_to_tempfile(file)
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
    return tmp_path, file_size, content_hash


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
    tmp_path, file_size, content_hash = await _stream_and_validate(file, file.filename, lang)

    # Per-user dedup: identical bytes already on this user's shelf → return
    # the existing book. Skips parsing, DB rows, cover upload, and the
    # embedding precompute entirely (no repeated vendor cost).
    existing = await find_existing_book_by_hash(db, user_id, content_hash, file_size)
    if existing is not None:
        logger.info(
            'upload.duplicate_short_circuit user=%s existing_book=%s',
            user_id, existing.id,
        )
        response = _build_book_response(existing)
        response['data']['duplicate'] = True
        return tmp_path, response

    # Pass through only explicitly-supplied title/author (None when absent) plus
    # the original filename; _resolve_metadata then prefers EPUB metadata over
    # the filename stem — see upload_service._resolve_metadata.
    provided_title = strip_html(title) if title else None
    provided_author = strip_html(author) if author else None
    tag_list = [strip_html(t) for t in tags.split(',')] if tags else []

    book = await create_book_with_content(
        db=db,
        user_id=user_id,
        title=provided_title,
        author=provided_author,
        file_type=file_type,
        file_size=file_size,
        file_path=tmp_path,
        tags=tag_list,
        original_filename=file.filename,
        content_hash=content_hash,
    )
    return tmp_path, _build_book_response(book)


@router.post('', status_code=status.HTTP_201_CREATED, response_model=GenericResponse, dependencies=[upload_limiter, write_limiter])
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
    slim: bool = False,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get book content (raw text/chapters). ``?slim=1`` omits the unused
    top-level plain-text copy (reader clients pass it to shrink large
    payloads)."""
    lang = await _get_user_lang(db, UUID(user['id']))
    data = await svc_get_book_content(db, UUID(user['id']), book_id, lang, slim=slim)
    if data is None:
        raise not_found_error(t('errors.book_not_found', lang))
    return {'success': True, 'data': data}
