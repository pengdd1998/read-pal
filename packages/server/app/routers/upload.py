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
    MAX_FILE_SIZE,
    create_book_with_content,
    get_file_type,
    validate_file,
)
from app.utils.i18n import _get_user_lang, t

router = APIRouter(prefix='/api/v1/upload', tags=['upload'])


@router.post('', status_code=status.HTTP_201_CREATED)
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
            detail=t('errors.no_filename', lang),
        )

    file_size = 0
    suffix = Path(file.filename).suffix.lower()

    # Validate filename/extension before reading any data
    error = validate_file(file.filename, 0)
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error,
        )

    file_type = get_file_type(file.filename)

    # Save to temp file with streaming size validation
    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=suffix,
    ) as tmp:
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            file_size += len(chunk)
            if file_size > MAX_FILE_SIZE:
                tmp.close()
                os.unlink(tmp.name)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f'File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB',
                )
            tmp.write(chunk)
        tmp_path = tmp.name

    try:
        # Final validation (extension + size check)
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


@router.get('/books/{book_id}/content')
async def get_book_content(
    book_id: UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get book content (raw text/chapters)."""
    from sqlalchemy import select as sa_select
    from app.models.book import Book
    from app.models.document import Document

    lang = await _get_user_lang(db, UUID(user['id']))

    result = await db.execute(
        sa_select(Book).where(
            Book.id == book_id,
            Book.user_id == UUID(user['id']),
        ),
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.book_not_found', lang)},
        )

    result = await db.execute(
        sa_select(Document).where(Document.book_id == book_id),
    )
    doc = result.scalar_one_or_none()

    content = ''
    if doc and hasattr(doc, 'content') and doc.content:
        content = doc.content
    elif doc and hasattr(doc, 'chapters') and doc.chapters:
        content = '\n'.join(
            ch.get('content', '') for ch in doc.chapters if isinstance(ch, dict)
        )

    # Build chapters array from document if available
    chapters = []
    if doc and hasattr(doc, 'chapters') and doc.chapters:
        for i, ch in enumerate(doc.chapters):
            if isinstance(ch, dict):
                chapters.append({
                    'id': ch.get('id', str(i)),
                    'title': ch.get('title', f'Chapter {i + 1}'),
                    'content': ch.get('content', ''),
                    'rawContent': ch.get('rawContent', ch.get('content', '')),
                })

    # For books without uploaded content (e.g. sample books), provide a placeholder chapter
    if not chapters and not content:
        content = (
            f'<h1>{book.title}</h1>'
            f'<p><em>by {book.author}</em></p>'
            f'<p>This is a sample book. Upload an EPUB or PDF to get the full reading experience '
            f'with AI companion, highlights, and notes.</p>'
            f'<p>To upload a real book, go to your Library and use the upload area.</p>'
        )
        chapters = [{
            'id': 'sample-0',
            'title': f'{book.title} — Sample',
            'content': content,
            'rawContent': content,
        }]

    return {
        'success': True,
        'data': {
            'book': {
                'id': str(book.id),
                'title': book.title,
                'author': book.author,
                'fileType': book.file_type.value if hasattr(book.file_type, 'value') else book.file_type,
                'fileSize': book.file_size,
                'totalPages': book.total_pages,
                'currentPage': book.current_page,
                'progress': float(book.progress) if book.progress else 0,
                'status': book.status.value if hasattr(book.status, 'value') else book.status,
                'tags': book.tags or [],
                'metadata': book.metadata_,
            },
            'chapters': chapters,
            'content': content,
        },
    }
