"""HTML and Markdown annotation exporters."""

from __future__ import annotations

from typing import Any

from app.models.annotation import Annotation, AnnotationType
from app.utils.annotations import match_annotation_type


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

    highlights = [a for a in annotations if match_annotation_type(a.type, AnnotationType.highlight)]
    notes = [a for a in annotations if match_annotation_type(a.type, AnnotationType.note)]
    bookmarks = [a for a in annotations if match_annotation_type(a.type, AnnotationType.bookmark)]

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

    highlights = [a for a in annotations if match_annotation_type(a.type, AnnotationType.highlight)]
    notes = [a for a in annotations if match_annotation_type(a.type, AnnotationType.note)]
    bookmarks = [a for a in annotations if match_annotation_type(a.type, AnnotationType.bookmark)]

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
