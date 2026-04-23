"""APA, MLA, Chicago, and BibTeX citation exporters."""

from __future__ import annotations

from app.models.annotation import Annotation
from app.models.book import Book
from app.utils.annotations import annotation_type_value


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


def _annotation_lines(annotations: list[Annotation]) -> list[str]:
    """Build annotated bibliography lines from annotations."""
    lines: list[str] = []
    for ann in annotations:
        ann_type = annotation_type_value(ann.type)
        lines.append(f'  [{ann_type.title()}] {ann.content}')
        if ann.note:
            lines.append(f'    Note: {ann.note}')
    return lines


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

    lines = [citation, ''] + _annotation_lines(annotations)
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

    lines = [citation, ''] + _annotation_lines(annotations)
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

    lines = [citation, ''] + _annotation_lines(annotations)
    return '\n'.join(lines)


def export_citation_bibtex(
    book: Book,
    annotations: list[Annotation],
) -> str:
    """Generate BibTeX entry with annotations as note fields."""
    author_parts = book.author.split() if book.author else ['Unknown']
    last_name = author_parts[-1] if author_parts else 'Unknown'
    year = _get_year(book)
    publisher = _get_publisher(book)

    # Generate a cite key: last name + year + first word of title
    title_word = (book.title.split()[0] if book.title else 'untitled').lower()
    cite_key = f'{last_name.lower()}{year}{title_word}'

    meta = getattr(book, 'metadata_', None) or {}
    isbn = meta.get('isbn', '')

    entry_lines = [
        f'@book{{{cite_key},',
        f'  author = {{{book.author}}},',
        f'  title = {{{book.title}}},',
        f'  year = {{{year}}},',
    ]
    if publisher:
        entry_lines.append(f'  publisher = {{{publisher}}},')
    if isbn:
        entry_lines.append(f'  isbn = {{{isbn}}},')

    if annotations:
        notes = []
        for ann in annotations[:10]:
            ann_type = annotation_type_value(ann.type)
            note_text = f'[{ann_type.title()}] {ann.content}'
            if ann.note:
                note_text += f' — {ann.note}'
            notes.append(note_text)
        entry_lines.append(f'  annote = {{{" | ".join(notes)}}},')

    entry_lines.append('}')
    return '\n'.join(entry_lines)
