"""Flashcard routes — CRUD and SM-2 spaced repetition review."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.flashcard import FlashcardCreate, FlashcardReview
from app.services import flashcard_service

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
