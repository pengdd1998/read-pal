"""Persona recommendation — suggests reading friend persona based on user behavior."""

from __future__ import annotations

from uuid import UUID

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.reading_session import ReadingSession
from app.utils.db import db_error_guard

logger = structlog.get_logger('read-pal.friend')

# Persona recommendation thresholds
_POWER_USER_DENSITY = 3.0   # annotations per session for "power user"
_POWER_USER_SESSIONS = 20   # minimum sessions to qualify
_EXPLORER_BOOKS = 5         # distinct books for "explorer"
_CASUAL_DENSITY = 1.0       # low annotation density for "casual"
_CASUAL_SESSIONS = 10       # minimum sessions to qualify

_SAGE_DEFAULT: dict[str, str] = {
    'recommendedPersona': 'sage',
    'reason': (
        'Based on your reading patterns, Sage is a thoughtful '
        'companion who offers philosophical insights to deepen '
        'your reading.'
    ),
}

_EMPTY_STATS: dict[str, int] = {
    'total_sessions': 0,
    'total_annotations': 0,
    'total_chats': 0,
    'distinct_books': 0,
}


async def _gather_reading_stats(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, int]:
    """Query aggregate reading stats for a user."""
    try:
        async with db_error_guard(
            'friend_persona._gather_reading_stats',
            user_id=str(user_id),
        ):
            sessions_q = await db.execute(
                select(func.count()).select_from(ReadingSession).where(
                    ReadingSession.user_id == user_id,
                ),
            )
            total_sessions = sessions_q.scalar() or 0

            annotations_q = await db.execute(
                select(func.count()).select_from(Annotation).where(
                    Annotation.user_id == user_id,
                ),
            )
            total_annotations = annotations_q.scalar() or 0

            chats_q = await db.execute(
                select(func.count()).select_from(ChatMessage).where(
                    ChatMessage.user_id == user_id,
                ),
            )
            total_chats = chats_q.scalar() or 0

            books_q = await db.execute(
                select(func.count(Book.id.distinct())).where(
                    Book.user_id == user_id,
                ),
            )
            distinct_books = books_q.scalar() or 0

            return {
                'total_sessions': total_sessions,
                'total_annotations': total_annotations,
                'total_chats': total_chats,
                'distinct_books': distinct_books,
            }
    except Exception:
        return _EMPTY_STATS


def _compute_reading_metrics(
    total_sessions: int,
    total_annotations: int,
    total_chats: int,
) -> tuple[float, float]:
    """Compute annotation density and chat propensity from raw stats."""
    annotation_density = (
        total_annotations / total_sessions if total_sessions > 0 else 0
    )
    chat_propensity = (
        total_chats / total_sessions if total_sessions > 0 else 0
    )
    return annotation_density, chat_propensity


def _match_persona_rule(
    annotation_density: float,
    chat_propensity: float,
    total_sessions: int,
    distinct_books: int,
) -> dict[str, str] | None:
    """Return the first matching persona recommendation, or None."""
    if (
        annotation_density > _POWER_USER_DENSITY
        and total_sessions > _POWER_USER_SESSIONS
    ):
        return {
            'recommendedPersona': 'alex',
            'reason': (
                'Based on your reading patterns, you annotate heavily '
                'and study systematically. Alex will match your '
                'analytical approach.'
            ),
        }
    if chat_propensity > 2.0:
        return {
            'recommendedPersona': 'quinn',
            'reason': (
                'Based on your reading patterns, you love discussing '
                'what you read. Quinn will spark creative conversations '
                'with you.'
            ),
        }
    if distinct_books > _EXPLORER_BOOKS:
        return {
            'recommendedPersona': 'penny',
            'reason': (
                'Based on your reading patterns, you read widely across '
                'many books. Penny shares your enthusiasm for diverse '
                'reading.'
            ),
        }
    if (
        annotation_density < _CASUAL_DENSITY
        and total_sessions > _CASUAL_SESSIONS
    ):
        return {
            'recommendedPersona': 'sam',
            'reason': (
                'Based on your reading patterns, you stay focused on '
                'the text without many annotations. Sam will respect '
                'your practical style.'
            ),
        }
    return None


def _pick_persona(
    total_sessions: int,
    total_annotations: int,
    total_chats: int,
    distinct_books: int,
) -> dict[str, str]:
    """Apply persona recommendation rules based on reading stats."""
    density, propensity = _compute_reading_metrics(
        total_sessions, total_annotations, total_chats,
    )
    rule_match = _match_persona_rule(
        density, propensity, total_sessions, distinct_books,
    )
    return rule_match if rule_match is not None else _SAGE_DEFAULT


async def recommend_persona(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, str]:
    """Analyze user reading behavior and recommend the best persona."""
    stats = await _gather_reading_stats(db, user_id)
    return _pick_persona(
        total_sessions=stats['total_sessions'],
        total_annotations=stats['total_annotations'],
        total_chats=stats['total_chats'],
        distinct_books=stats['distinct_books'],
    )
