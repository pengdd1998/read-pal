"""JSON, book-club, study-guide, research, and annotated-bibliography exporters.

These formats are offered by the frontend (ExportPreviewModal, ShareDiscussion,
ShareCitation, StudyGuideCard) but were never implemented on the backend, so
every one of them 400'd with INVALID_FORMAT. Each renderer below is a
deterministic, LLM-free transformation of the book's annotations — no GLM
dependency, so they work even when the AI provider is rate-limited.
"""

from __future__ import annotations

import json

from app.models.annotation import Annotation
from app.models.book import Book
from app.utils.annotations import annotation_type_value


def _meta(book: Book) -> dict:
    """Best-effort publication metadata dict."""
    meta = getattr(book, 'metadata_', None) or {}
    return meta if isinstance(meta, dict) else {}


def _year(book: Book) -> str:
    return str(_meta(book).get('year', 'n.d.'))


def _ann_dict(ann: Annotation) -> dict:
    """Serialize one annotation to a plain dict (JSON-safe)."""
    return {
        'type': annotation_type_value(ann.type),
        'content': ann.content,
        'note': ann.note or '',
        'color': ann.color or '',
        'tags': list(ann.tags or []),
        'location': str(ann.location) if ann.location is not None else None,
        'createdAt': ann.created_at.isoformat() if ann.created_at else None,
    }


def export_json(
    book: Book,
    annotations: list[Annotation],
) -> str:
    """Machine-readable JSON export of book + annotations."""
    payload = {
        'book': {
            'title': book.title,
            'author': book.author,
            'progress': float(book.progress),
        },
        'annotations': [_ann_dict(a) for a in annotations],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _grouped_by_chapter(annotations: list[Annotation]) -> dict[str, list[Annotation]]:
    """Group annotations by chapter label (best-effort, from location)."""
    groups: dict[str, list[Annotation]] = {}
    for ann in annotations:
        loc = ann.location if isinstance(ann.location, dict) else {}
        key = f'Chapter {loc.get("chapter", "?")}' if loc.get('chapter') is not None else 'General'
        groups.setdefault(key, []).append(ann)
    return groups


def export_book_club(
    book: Book,
    annotations: list[Annotation],
) -> str:
    """Discussion-ready summary: book info + highlights/notes grouped by chapter,
    with open-ended discussion prompts seeded from the most-tagged passages."""
    lines = [
        f'# {book.title}',
        f'**Author:** {book.author}',
        f'**Progress:** {float(book.progress):.0f}%',
        '',
    ]
    if not annotations:
        lines.append('_No annotations yet — start highlighting to build the discussion._')
        return '\n'.join(lines)

    highlights = [a for a in annotations if annotation_type_value(a.type) == 'highlight']
    notes = [a for a in annotations if annotation_type_value(a.type) == 'note']
    lines.append(f'_{len(highlights)} highlights · {len(notes)} notes_')
    lines.append('')

    for chapter, anns in _grouped_by_chapter(annotations).items():
        lines.append(f'## {chapter}')
        for ann in anns:
            kind = annotation_type_value(ann.type).title()
            tag_str = f' `{"` `".join(ann.tags or [])}`' if ann.tags else ''
            lines.append(f'- **{kind}:** {ann.content}{tag_str}')
            if ann.note:
                lines.append(f'  - _Note:_ {ann.note}')
        lines.append('')

    # Seed discussion prompts from tags so clubs have somewhere to start.
    all_tags = sorted({t for a in annotations for t in (a.tags or [])})
    if all_tags:
        lines.append('## Discussion prompts')
        for tag in all_tags[:5]:
            lines.append(f'- What role does **{tag}** play in this book?')
    return '\n'.join(lines)


def export_study_guide(
    book: Book,
    annotations: list[Annotation],
) -> str:
    """Study guide: key passages by tag, grouped for review and recall."""
    lines = [
        f'# Study Guide — {book.title}',
        f'_{book.author}_',
        '',
    ]
    if not annotations:
        lines.append('_No highlights or notes yet. Annotate as you read to build your guide._')
        return '\n'.join(lines)

    by_tag: dict[str, list[Annotation]] = {}
    untagged: list[Annotation] = []
    for ann in annotations:
        if ann.tags:
            for t in ann.tags:
                by_tag.setdefault(t, []).append(ann)
        else:
            untagged.append(ann)

    for tag in sorted(by_tag):
        lines.append(f'## {tag.title()}')
        for ann in by_tag[tag][:8]:
            kind = annotation_type_value(ann.type).title()
            lines.append(f'- **{kind}:** {ann.content}')
            if ann.note:
                lines.append(f'  - _{ann.note}_')
        lines.append('')

    if untagged:
        lines.append('## Other passages')
        for ann in untagged[:10]:
            lines.append(f'- {ann.content}')
    return '\n'.join(lines)


def export_research(
    book: Book,
    annotations: list[Annotation],
) -> str:
    """Research export: structured key-value digest suitable for note-taking tools."""
    meta = _meta(book)
    lines = [
        f'# Research notes — {book.title}',
        f'- Author: {book.author}',
        f'- Year: {_year(book)}',
    ]
    publisher = meta.get('publisher')
    if publisher:
        lines.append(f'- Publisher: {publisher}')
    isbn = meta.get('isbn')
    if isbn:
        lines.append(f'- ISBN: {isbn}')
    lines.append(f'- Progress: {float(book.progress):.0f}%')
    lines.append('')

    if not annotations:
        lines.append('_No annotations._')
        return '\n'.join(lines)

    lines.append('## Key passages')
    for ann in annotations:
        kind = annotation_type_value(ann.type)
        tags = ', '.join(ann.tags or [])
        header = f'[{kind}]'
        if tags:
            header += f' ({tags})'
        lines.append(f'- {header} {ann.content}')
        if ann.note:
            lines.append(f'  - Note: {ann.note}')
    return '\n'.join(lines)


def export_annotated_bibliography(
    book: Book,
    annotations: list[Annotation],
) -> str:
    """Annotated bibliography entry: citation + descriptive annotation drawn
    from the reader's own notes."""
    year = _year(book)
    publisher = _meta(book).get('publisher', '')
    citation = f'{book.author} ({year}). {book.title}.'
    if publisher:
        citation += f' {publisher}.'

    notes = [a for a in annotations if annotation_type_value(a.type) == 'note']
    if not notes:
        annotation_text = (
            f'{len(annotations)} passages annotated from this text.'
        )
    else:
        # Synthesize a one-paragraph annotation from the reader's notes.
        parts = [a.content if a.note is None else f'{a.note}' for a in notes[:5]]
        annotation_text = ' '.join(p.strip() for p in parts if p)

    return f'{citation}\n\n{annotation_text}'
