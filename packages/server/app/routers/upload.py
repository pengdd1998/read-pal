"""File upload router."""

import os
import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.services.upload_service import (
    create_book_with_content,
    get_file_type,
    validate_file,
)

router = APIRouter(prefix='/api/v1/upload', tags=['upload'])


@router.post('/', status_code=status.HTTP_201_CREATED)
async def upload_book(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    title: str | None = None,
    author: str | None = None,
    tags: str | None = None,
) -> dict:
    """Upload an EPUB or PDF file and create a book record."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='No filename provided',
        )

    file_size = 0
    suffix = Path(file.filename).suffix.lower()
    error = validate_file(file.filename, 0)
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error,
        )

    file_type = get_file_type(file.filename)

    # Save to temp file
    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=suffix,
    ) as tmp:
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            file_size += len(chunk)
            tmp.write(chunk)
        tmp_path = tmp.name

    try:
        # Validate size after reading
        error = validate_file(file.filename, file_size)
        if error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error,
            )

        book_title = title or Path(file.filename).stem
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
                'id': str(book.id),
                'title': book.title,
                'author': book.author,
                'file_type': book.file_type.value,
                'total_pages': book.total_pages,
                'status': book.status.value,
            },
        }
    finally:
        os.unlink(tmp_path)
