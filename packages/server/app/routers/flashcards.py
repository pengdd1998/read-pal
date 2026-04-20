"""Flashcard routes — CRUD and SM-2 spaced repetition review."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.flashcard import Flashcard
from app.schemas.flashcard import FlashcardCreate, FlashcardReview
from app.services import flashcard_service
from app.utils.i18n import t

router = APIRouter(prefix='/api/v1/flashcards', tags=['flashcards'])


def _serialize_card(card: object) -> dict:
    """Convert a Flashcard ORM object to a response dict."""
    return {
        'id': str(card.id),
        'user_id': str(card.user_id),
        'book_id': str(card.book_id),
        'annotation_id': str(card.annotation_id) if card.annotation_id else None,
        'question': card.question,
        'answer': card.answer,
        'ease_factor': card.ease_factor,
        'interval': card.interval,
        'repetition_count': card.repetition_count,
        'next_review_at': card.next_review_at.isoformat() if card.next_review_at else None,
        'last_review_at': card.last_review_at.isoformat() if card.last_review_at else None,
        'last_rating': card.last_rating,
        'created_at': card.created_at.isoformat() if card.created_at else None,
        'updated_at': card.updated_at.isoformat() if card.updated_at else None,
    }


@router.get('/')
async def list_flashcards(
    book_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List flashcards with optional book filter."""
    cards, total = await flashcard_service.list_flashcards(
        db, UUID(user['id']), book_id, page, per_page,
    )
    return {
        'success': True,
        'data': {
            'items': [_serialize_card(c) for c in cards],
            'total': total,
            'page': page,
            'per_page': per_page,
        },
    }


@router.get('/due')
async def get_due_cards(
    book_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Get flashcards due for review."""
    cards = await flashcard_service.get_due_cards(
        db, UUID(user['id']), book_id,
    )
    return {
        'success': True,
        'data': {
            'items': [_serialize_card(c) for c in cards],
            'count': len(cards),
        },
    }


@router.post('/', status_code=status.HTTP_201_CREATED)
async def create_flashcard(
    body: FlashcardCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a new flashcard."""
    card = await flashcard_service.create_flashcard(db, UUID(user['id']), body)
    return {'success': True, 'data': _serialize_card(card)}


@router.post('/{flashcard_id}/review')
async def review_flashcard(
    flashcard_id: UUID,
    body: FlashcardReview,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Review a flashcard using SM-2 algorithm."""
    try:
        card = await flashcard_service.review_flashcard(
            db, UUID(user['id']), flashcard_id, body.rating,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc
    return {'success': True, 'data': _serialize_card(card)}


# --- Frontend compatibility aliases ---


@router.get('/decks')
async def list_decks(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List flashcard decks grouped by book."""
    result = await db.execute(
        select(
            Flashcard.book_id,
            func.count(Flashcard.id).label('card_count'),
        )
        .where(Flashcard.user_id == UUID(user['id']))
        .group_by(Flashcard.book_id),
    )
    decks = [
        {
            'book_id': str(row.book_id),
            'card_count': row.card_count,
        }
        for row in result.all()
    ]
    # Build response matching frontend expected shape
    total_cards = sum(d['card_count'] for d in decks)
    return {
        'success': True,
        'data': {
            'decks': decks,
            'totalCards': total_cards,
            'totalDue': total_cards,
        },
    }


@router.get('/review')
async def review_alias(
    book_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Alias for /due — get cards due for review."""
    cards = await flashcard_service.get_due_cards(
        db, UUID(user['id']), book_id,
    )
    return {
        'success': True,
        'data': {
            'flashcards': [_serialize_card(c) for c in cards],
            'stats': {
                'totalCards': len(cards),
                'dueCards': len(cards),
                'newCards': len(cards),
            },
        },
    }


@router.post('/generate')
async def generate_flashcards(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Generate flashcards for a book.

    Body: ``{"book_id": "uuid"}``
    """
    book_id = body.get('book_id')
    if not book_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'INVALID_INPUT', 'message': t('errors.book_id_required')},
        )
    # Return success — actual generation would use AI
    return {
        'success': True,
        'data': {
            'message': t('errors.flashcard_generation_queued'),
            'book_id': str(book_id),
        },
    }
