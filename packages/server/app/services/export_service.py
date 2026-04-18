"""Export service — multi-format annotation export."""

from __future__ import annotations

import csv
import io
import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book

logger = logging.getLogger('read-pal.export')

SUPPORTED_FORMATS = ('csv', 'markdown', 'html', 'zotero')
CITATION_FORMATS = ('apa', 'mla', 'chicago')


def _match_type(value: Any, target: AnnotationType) -> bool:
    """Compare annotation type — works with both enum members and strings."""
    if hasattr(value, 'value'):
        return value == target or value.value == target.value
    return value == target.value


def _get_year(book: Book) -> str:
    """Extract publication year from book metadata."""
    meta = getattr(book, 'metadata_', None)
    if meta and isinstance(meta, dict):
        return str(meta.get('year', 'n.d.'))
    return 'n.d.'


def _get_publisher(book: Book) -> str:
    """Extract publisher from book metadata."""
    meta = getattr(book, 'metadata_', None)
    if meta and isinstance(meta, dict):
        return meta.get('publisher', '')
    return ''


def export_citation_apa(
    book: Book,
    annotations: list[Annotation],
) -> str:
    """Generate APA 7th edition citation + annotated bibliography."""
    year = _get_year(book)
    publisher = _get_publisher(book)
    parts = [f'{book.author} ({year}). *{book.title}*.']
    if publisher:
        parts.append(f' {publisher}.')
    citation = ''.join(parts)

    if not annotations:
        return citation

    lines = [citation, '']
    for ann in annotations:
        ann_type = ann.type.value if hasattr(ann.type, 'value') else ann.type
        lines.append(f'  [{ann_type.title()}] {ann.content}')
        if ann.note:
            lines.append(f'    Note: {ann.note}')
    return '\n'.join(lines)


def export_citation_mla(
    book: Book,
    annotations: list[Annotation],
) -> str:
    """Generate MLA 9th edition citation + annotated bibliography."""
    author_parts = book.author.split() if book.author else ['Unknown']
    last_name = author_parts[-1] if author_parts else 'Unknown'
    first_names = ' '.join(author_parts[:-1]) if len(author_parts) > 1 else ''
    year = _get_year(book)
    publisher = _get_publisher(book)

    if first_names:
        citation = f'{last_name}, {first_names}. *{book.title}*.'
    else:
        citation = f'{last_name}. *{book.title}*.'

    if publisher:
        citation += f' {publisher}, {year}.'
    else:
        citation += f' {year}.'

    if not annotations:
        return citation

    lines = [citation, '']
    for ann in annotations:
        ann_type = ann.type.value if hasattr(ann.type, 'value') else ann.type
        lines.append(f'  [{ann_type.title()}] {ann.content}')
        if ann.note:
            lines.append(f'    Note: {ann.note}')
    return '\n'.join(lines)


def export_citation_chicago(
    book: Book,
    annotations: list[Annotation],
) -> str:
    """Generate Chicago Manual of Style bibliography entry."""
    year = _get_year(book)
    publisher = _get_publisher(book)
    citation = f'{book.author}. *{book.title}*.'
    if publisher and year != 'n.d.':
        citation += f' {publisher}, {year}.'
    elif year != 'n.d.':
        citation += f' {year}.'

    if not annotations:
        return citation

    lines = [citation, '']
    for ann in annotations:
        ann_type = ann.type.value if hasattr(ann.type, 'value') else ann.type
        lines.append(f'  [{ann_type.title()}] {ann.content}')
        if ann.note:
            lines.append(f'    Note: {ann.note}')
    return '\n'.join(lines)


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


def export_csv(annotations: list[Annotation]) -> str:
    """Convert annotations to CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'type',
        'content',
        'note',
        'color',
        'tags',
        'location',
        'created_at',
    ])

    for ann in annotations:
        ann_type = ann.type.value if hasattr(ann.type, 'value') else ann.type
        writer.writerow([
            ann_type,
            ann.content,
            ann.note or '',
            ann.color or '',
            ','.join(ann.tags or []),
            str(ann.location),
            ann.created_at.isoformat() if ann.created_at else '',
        ])

    return output.getvalue()


def export_markdown(
    annotations: list[Annotation],
    book_info: dict[str, Any],
) -> str:
    """Convert annotations to Markdown."""
    title = book_info.get('title', 'Unknown')
    author = book_info.get('author', 'Unknown')
    progress = book_info.get('progress', 0)

    lines: list[str] = []
    lines.append(f'# {title}')
    lines.append(f'**Author:** {author}')
    lines.append(f'**Progress:** {progress}%')
    lines.append('')
    lines.append('---')
    lines.append('')

    highlights = [a for a in annotations if _match_type(a.type, AnnotationType.highlight)]
    notes = [a for a in annotations if _match_type(a.type, AnnotationType.note)]
    bookmarks = [a for a in annotations if _match_type(a.type, AnnotationType.bookmark)]

    if highlights:
        lines.append('## Highlights')
        lines.append('')
        for h in highlights:
            lines.append(f'> {h.content}')
            if h.note:
                lines.append(f'> *Note: {h.note}*')
            if h.tags:
                tag_str = ', '.join(h.tags)
                lines.append(f'> *Tags: {tag_str}*')
            lines.append('')

    if notes:
        lines.append('## Notes')
        lines.append('')
        for n in notes:
            lines.append(f'### {n.content}')
            if n.note:
                lines.append(n.note)
            lines.append('')

    if bookmarks:
        lines.append('## Bookmarks')
        lines.append('')
        for b in bookmarks:
            lines.append(f'- {b.content}')
            lines.append('')

    return '\n'.join(lines)


def _escape_html(text: str) -> str:
    """Escape text for safe HTML embedding."""
    return (
        text.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
    )


def export_html(
    annotations: list[Annotation],
    book_info: dict[str, Any],
) -> str:
    """Convert annotations to styled HTML."""
    title = book_info.get('title', 'Unknown')
    author = book_info.get('author', 'Unknown')
    progress = book_info.get('progress', 0)

    highlights = [a for a in annotations if _match_type(a.type, AnnotationType.highlight)]
    notes = [a for a in annotations if _match_type(a.type, AnnotationType.note)]
    bookmarks = [a for a in annotations if _match_type(a.type, AnnotationType.bookmark)]

    sections: list[str] = []

    for h in highlights:
        tags_html = ''
        if h.tags:
            tags_html = ' '.join(
                f'<span class="tag">{_escape_html(t)}</span>' for t in h.tags
            )
        note_html = ''
        if h.note:
            escaped_note = _escape_html(h.note)
            note_html = f'<p class="note"><em>Note:</em> {escaped_note}</p>'
        escaped_content = _escape_html(h.content)
        sections.append(
            '<blockquote class="highlight">'
            + f'<p>{escaped_content}</p>'
            + note_html
            + f'<div class="tags">{tags_html}</div>'
            + '</blockquote>'
        )

    for n in notes:
        escaped_content = _escape_html(n.content)
        escaped_note = _escape_html(n.note or '')
        sections.append(
            '<div class="note-entry">'
            + f'<h3>{escaped_content}</h3>'
            + f'<p>{escaped_note}</p>'
            + '</div>'
        )

    for b in bookmarks:
        escaped_content = _escape_html(b.content)
        sections.append(f'<div class="bookmark">{escaped_content}</div>')

    safe_title = _escape_html(title)
    safe_author = _escape_html(author)
    sections_html = ''.join(sections)

    return (
        '<!DOCTYPE html>'
        '<html lang="en"><head>'
        '<meta charset="utf-8">'
        f'<title>{safe_title} — Annotations</title>'
        '<style>'
        'body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#333}'
        'h1{color:#1a1a1a} h2{color:#444;border-bottom:1px solid #eee;padding-bottom:.5rem}'
        '.highlight{border-left:3px solid #6366f1;padding:.5rem 1rem;margin:1rem 0;background:#f8f9fa}'
        '.note{font-size:.9rem;color:#666;margin-top:.5rem}'
        '.tag{display:inline-block;background:#e0e7ff;color:#4338ca;padding:.1rem .4rem;border-radius:4px;font-size:.8rem;margin-right:.3rem}'
        '.note-entry{margin:1rem 0} .note-entry h3{font-size:1.1rem}'
        '.bookmark{padding:.5rem;background:#fef3c7;border-left:3px solid #f59e0b;margin:.5rem 0}'
        '</style></head><body>'
        f'<h1>{safe_title}</h1>'
        f'<p><strong>Author:</strong> {safe_author} &mdash; '
        f'<strong>Progress:</strong> {progress}%</p>'
        '<hr>'
        + sections_html
        + '</body></html>'
    )


def export_zotero_rdf(
    annotations: list[Annotation],
    book_info: dict[str, Any],
) -> str:
    """Export annotations in basic Zotero-compatible RDF format."""
    title = book_info.get('title', 'Unknown')
    author = book_info.get('author', 'Unknown')

    safe_title = _escape_html(title)
    safe_author = _escape_html(author)

    items: list[str] = []
    for i, ann in enumerate(annotations):
        note_text = _escape_html(ann.note or '')
        date_str = ann.created_at.isoformat() if ann.created_at else ''
        ann_type = ann.type.value if hasattr(ann.type, 'value') else ann.type
        escaped_type = _escape_html(ann_type)
        escaped_content = _escape_html(ann.content)
        items.append(
            f'<z:Annotation rdf:about="#ann-{i}">'
            + f'<z:type>{escaped_type}</z:type>'
            + f'<z:content>{escaped_content}</z:content>'
            + f'<z:note>{note_text}</z:note>'
            + f'<dc:date>{date_str}</dc:date>'
            + '</z:Annotation>'
        )

    items_xml = ''.join(items)

    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"'
        ' xmlns:dc="http://purl.org/dc/elements/1.1/"'
        ' xmlns:z="http://www.zotero.org/namespaces/export#">'
        '<z:UserLibrary>'
        '<z:Book rdf:about="#book">'
        + f'<dc:title>{safe_title}</dc:title>'
        + f'<dc:creator>{safe_author}</dc:creator>'
        + '</z:Book>'
        + items_xml
        + '</z:UserLibrary>'
        '</rdf:RDF>'
    )


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

    if format == 'apa':
        return (export_citation_apa(book, annotations), 'text/plain; charset=utf-8')
    elif format == 'mla':
        return (export_citation_mla(book, annotations), 'text/plain; charset=utf-8')
    elif format == 'chicago':
        return (export_citation_chicago(book, annotations), 'text/plain; charset=utf-8')
    elif format == 'csv':
        return (
            export_csv(annotations),
            'text/csv; charset=utf-8',
        )
    elif format == 'markdown':
        return (
            export_markdown(annotations, book_info),
            'text/markdown; charset=utf-8',
        )
    elif format == 'html':
        return (
            export_html(annotations, book_info),
            'text/html; charset=utf-8',
        )
    elif format == 'zotero':
        return (
            export_zotero_rdf(annotations, book_info),
            'application/rdf+xml; charset=utf-8',
        )

    return None
