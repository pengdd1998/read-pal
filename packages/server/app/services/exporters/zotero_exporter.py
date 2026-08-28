"""Zotero RDF annotation exporter.

Produces RDF/XML compatible with Zotero's import format using:
- Dublin Core (dc:) for bibliographic metadata
- Zotero export namespace (z:) for item types
- dcterms:isPartOf to link notes to their parent book
"""

from __future__ import annotations

from typing import Any
from xml.sax.saxutils import escape

from app.models.annotation import Annotation
from app.utils.annotations import annotation_type_value


def _build_book_xml(book_info: dict[str, Any]) -> str:
    """Build the bibliographic item XML block from book metadata."""
    title = book_info.get('title', 'Unknown')
    author = book_info.get('author', 'Unknown')
    isbn = book_info.get('isbn', '')
    publisher = book_info.get('publisher', '')
    year = book_info.get('year', '')

    parts: list[str] = []
    parts.append(f'<dc:title>{escape(title)}</dc:title>')
    parts.append(f'<dc:creator>{escape(author)}</dc:creator>')
    if isbn:
        parts.append(f'<dc:identifier>ISBN {escape(isbn)}</dc:identifier>')
    if publisher:
        parts.append(f'<dc:publisher>{escape(publisher)}</dc:publisher>')
    if year:
        parts.append(f'<dc:date>{escape(str(year))}</dc:date>')
    parts.append('<z:ItemType>book</z:ItemType>')
    return ''.join(parts)


def _build_note_xml(
    ann: Annotation,
    index: int,
    book_title: str,
) -> str:
    """Build a single Zotero z:Note element for one annotation."""
    ann_type = annotation_type_value(ann.type)
    content = escape(ann.content or '')
    note_text = escape(ann.note or '')
    date_str = ann.created_at.isoformat() if ann.created_at else ''
    chapter = ''
    if ann.location and isinstance(ann.location, dict):
        ch = ann.location.get('chapter')
        if ch is not None:
            chapter = f'Chapter {ch}'

    note_html_parts: list[str] = []
    note_html_parts.append(f'<p><strong>{escape(ann_type)}</strong></p>')
    note_html_parts.append(f'<p>{content}</p>')
    if note_text:
        note_html_parts.append(f'<p><em>Note: {note_text}</em></p>')
    if chapter:
        note_html_parts.append(f'<p>Location: {escape(chapter)}</p>')
    note_html = ''.join(note_html_parts)

    return (
        f'<z:Note rdf:about="#ann_{index}">'
        + '<z:ItemType>note</z:ItemType>'
        + '<dc:title>{}</dc:title>'.format(escape(f'{ann_type} - {book_title}'))
        + f'<dc:description><![CDATA[{note_html}]]></dc:description>'
        + f'<dc:date>{escape(date_str)}</dc:date>'
        + '<dcterms:isPartOf rdf:resource="#item_0"/>'
        + '</z:Note>'
    )


def export_zotero_rdf(
    annotations: list[Annotation],
    book_info: dict[str, Any],
) -> str:
    """Export annotations in Zotero-importable RDF/XML format.

    Zotero's RDF import expects:
    - A top-level bibliographic item (book) with dc: metadata
    - Child z:Note items linked via dcterms:isPartOf
    - Each item has rdf:about with a unique URI
    - z:ItemType specifies the Zotero item type
    """
    book_xml = _build_book_xml(book_info)
    title = book_info.get('title', 'Unknown')
    notes_xml = ''.join(
        _build_note_xml(ann, i, title) for i, ann in enumerate(annotations)
    )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rdf:RDF'
        ' xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"'
        ' xmlns:dc="http://purl.org/dc/elements/1.1/"'
        ' xmlns:dcterms="http://purl.org/dc/terms/"'
        ' xmlns:z="http://www.zotero.org/namespaces/export#">\n'
        '<z:UserLibrary>\n'
        '<z:Item rdf:about="#item_0">'
        + book_xml
        + '</z:Item>\n'
        + notes_xml
        + '\n</z:UserLibrary>\n'
        '</rdf:RDF>'
    )
