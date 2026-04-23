"""Export service — thin dispatcher that delegates to format-specific exporters."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.services.exporters import (
    export_citation_apa,
    export_citation_bibtex,
    export_citation_chicago,
    export_citation_mla,
    export_csv,
    export_html,
    export_markdown,
    export_zotero_rdf,
)

logger = logging.getLogger('read-pal.export')

SUPPORTED_FORMATS = ('csv', 'markdown', 'html', 'zotero')
CITATION_FORMATS = ('apa', 'mla', 'chicago', 'bibtex')


async def _load_book_and_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> tuple[Book | None, list[Annotation]]:
    """Load book metadata and its annotations."""
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id),
    )
    book = result.scalar_one_or_none()
    if book is None:
        return None, []

    result = await db.execute(
        select(Annotation)
        .where(Annotation.user_id == user_id, Annotation.book_id == book_id)
        .order_by(Annotation.created_at),
    )
    annotations = list(result.scalars().all())
    return book, annotations


async def export(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    format: str,
) -> tuple[str, str] | None:
    """Export annotations in the specified format.

    Returns (content, content_type) or None if book not found.
    """
    book, annotations = await _load_book_and_annotations(db, user_id, book_id)
    if book is None:
        return None

    book_info = {
        'title': book.title,
        'author': book.author,
        'progress': float(book.progress),
    }

    dispatchers: dict[str, tuple[callable, str]] = {
        'apa': (lambda: export_citation_apa(book, annotations), 'text/plain; charset=utf-8'),
        'mla': (lambda: export_citation_mla(book, annotations), 'text/plain; charset=utf-8'),
        'chicago': (lambda: export_citation_chicago(book, annotations), 'text/plain; charset=utf-8'),
        'bibtex': (lambda: export_citation_bibtex(book, annotations), 'application/x-bibtex; charset=utf-8'),
        'csv': (lambda: export_csv(annotations), 'text/csv; charset=utf-8'),
        'markdown': (lambda: export_markdown(annotations, book_info), 'text/markdown; charset=utf-8'),
        'html': (lambda: export_html(annotations, book_info), 'text/html; charset=utf-8'),
        'zotero': (lambda: export_zotero_rdf(annotations, book_info), 'application/rdf+xml; charset=utf-8'),
    }

    entry = dispatchers.get(format)
    if entry is None:
        return None

    renderer, content_type = entry
    return (renderer(), content_type)
