"""Per-book data assembly and condensation for cross-book synthesis."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.reading_session import ReadingSession
from app.utils.sanitizer import sanitize_annotations, sanitize_chat_message


def build_book_meta(book: Book) -> dict[str, Any]:
  """Extract display metadata from a Book ORM object."""
  return {
    'title': book.title,
    'author': book.author,
    'progress': float(book.progress),
    'status': book.status,
  }


def build_highlights(
  annotations: list[Annotation],
) -> list[dict[str, Any]]:
  """Filter highlight-type annotations and sanitize."""
  from app.utils.annotations import match_annotation_type

  return [
    {
      'content': sanitize_annotations(a.content or ''),
      'note': sanitize_annotations(a.note or ''),
      'tags': a.tags,
    }
    for a in annotations
    if match_annotation_type(a.type, AnnotationType.highlight)
  ]


def build_notes(
  annotations: list[Annotation],
) -> list[dict[str, Any]]:
  """Filter note-type annotations and sanitize."""
  from app.utils.annotations import match_annotation_type

  return [
    {
      'content': sanitize_annotations(a.content or ''),
      'note': sanitize_annotations(a.note or ''),
      'tags': a.tags,
    }
    for a in annotations
    if match_annotation_type(a.type, AnnotationType.note)
  ]


def build_conversations(
  messages: list[ChatMessage],
) -> list[dict[str, Any]]:
  """Sanitize chat messages for prompt inclusion."""
  return [
    {'role': m.role, 'content': sanitize_chat_message(m.content or '')}
    for m in messages
  ]


def build_reading_sessions(
  sessions: list[ReadingSession],
) -> list[dict[str, Any]]:
  """Serialize reading sessions for prompt inclusion."""
  return [
    {
      'started_at': s.started_at.isoformat() if s.started_at else None,
      'duration': s.duration,
      'pages_read': s.pages_read,
      'highlights': s.highlights,
      'notes': s.notes,
    }
    for s in sessions
  ]


def assemble_book_data(
  book_ids: list[UUID],
  books: dict[UUID, Book],
  all_annotations: dict[UUID, list[Annotation]],
  all_messages: dict[UUID, list[ChatMessage]],
  all_sessions: dict[UUID, list[ReadingSession]],
  include_highlights: bool,
  include_notes: bool,
  include_conversations: bool,
) -> dict[UUID, dict[str, Any]]:
  """Assemble per-book data dicts from batch-loaded records."""
  data_map: dict[UUID, dict[str, Any]] = {}
  for bid in book_ids:
    book = books.get(bid)
    if book is None:
      continue
    data: dict[str, Any] = {'book': build_book_meta(book)}
    annotations = all_annotations.get(bid, [])
    if include_highlights:
      data['highlights'] = build_highlights(annotations)
    if include_notes:
      data['notes'] = build_notes(annotations)
    if include_conversations:
      data['conversations'] = build_conversations(
        all_messages.get(bid, []),
      )
    data['reading_sessions'] = build_reading_sessions(
      all_sessions.get(bid, []),
    )
    data_map[bid] = data
  return data_map


def condense_book(bd: dict[str, Any]) -> dict:
  """Build a condensed summary of a single book for prompts."""
  book = bd.get('book', {})
  return {
    'title': book.get('title'),
    'author': book.get('author'),
    'highlights': [
      sanitize_annotations(h.get('content', '')[:100])
      for h in bd.get('highlights', [])[:10]
    ],
    'notes': [
      sanitize_annotations(n.get('content', '')[:100])
      for n in bd.get('notes', [])[:5]
    ],
  }


def condense_book_data(all_book_data: list[dict[str, Any]]) -> list[dict]:
  """Build condensed per-book summaries for cross-book prompts."""
  return [condense_book(bd) for bd in all_book_data]
