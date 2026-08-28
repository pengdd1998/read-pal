"""Database loaders and message persistence for companion context."""

from uuid import UUID

import hashlib

import structlog
from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.services.companion.constants import ANNOTATION_LIMIT, HISTORY_LIMIT
from app.utils.db import db_error_guard
from app.utils.i18n import t
from app.utils.sanitizer import sanitize_chat_message
from app.utils.annotation_format import format_annotation_entry

logger = structlog.get_logger('read-pal.companion')


async def load_book(db: AsyncSession, user_id: UUID, book_id: UUID) -> Book:
    """Fetch book or raise a ValueError."""
    async with db_error_guard('load_book', book_id=str(book_id), user_id=str(user_id)):
        result = await db.execute(
            select(Book).where(
                Book.id == book_id,
                Book.user_id == user_id,
            ),
        )
        book = result.scalar_one_or_none()
    if book is None:
        raise ValueError(t('errors.book_not_found'))
    return book


async def load_history(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[HumanMessage | AIMessage]:
    """Load recent chat history as langchain messages.

    Filters out soft-deleted rows (deleted_at IS NULL) so the regenerate
    flow (P1-6) cleanly hides the discarded assistant message.
    """
    async with db_error_guard('load_history', book_id=str(book_id), user_id=str(user_id)):
        result = await db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.user_id == user_id,
                ChatMessage.book_id == book_id,
                ChatMessage.deleted_at.is_(None),
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(HISTORY_LIMIT),
        )
        rows = list(reversed(result.scalars().all()))
    messages: list[HumanMessage | AIMessage] = []
    for row in rows:
        if row.role == 'user':
            messages.append(HumanMessage(content=row.content))
        elif row.role == 'assistant':
            messages.append(AIMessage(content=row.content))
    return messages


async def load_annotations_context(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> str:
    """Load recent highlights/notes to enrich the system prompt."""
    async with db_error_guard(
        'load_annotations_context', book_id=str(book_id), user_id=str(user_id),
    ):
        result = await db.execute(
            select(Annotation)
            .where(
                Annotation.user_id == user_id,
                Annotation.book_id == book_id,
            )
            .order_by(Annotation.created_at.desc())
            .limit(ANNOTATION_LIMIT),
        )
        annotations = result.scalars().all()
    if not annotations:
        return ''

    parts: list[str] = []
    for ann in annotations:
        parts.append(format_annotation_entry(ann))
    return '\n'.join(parts)


def _content_hash(content: str) -> str:
    """md5(content[:500]) — matches migration 0017's dedup hash."""
    return hashlib.md5(content[:500].encode('utf-8')).hexdigest()


async def save_message(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    role: str,
    content: str,
) -> None:
    """Persist a single chat message.

    P-audit: user messages are sanitized at PERSIST time, not only at
    prompt-build time. Otherwise an injection that evaded detection in
    turn 1 is replayed raw into every later turn's history. Assistant
    messages pass through untouched — the sanitizer's data-wrap markers
    and input-pattern heuristics are calibrated for user input, and the
    assistant side is already covered by ``filter_output``.
    """
    if role == 'user':
        content = sanitize_chat_message(content)
    msg = ChatMessage(
        user_id=user_id,
        book_id=book_id,
        role=role,
        content=content,
        content_hash=_content_hash(content),
    )
    db.add(msg)
    async with db_error_guard('save_message', book_id=str(book_id), user_id=str(user_id)):
        await db.flush()
