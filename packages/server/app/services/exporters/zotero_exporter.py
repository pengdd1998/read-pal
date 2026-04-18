"""Zotero RDF annotation exporter."""

from __future__ import annotations

from typing import Any

from app.models.annotation import Annotation
from app.utils.annotations import annotation_type_value


def _escape_html(text: str) -> str:
    """Escape text for safe HTML/XML embedding."""
    return (
        text.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
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
        ann_type = annotation_type_value(ann.type)
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
