"""Flashcard routes — CRUD and SM-2 spaced repetition review."""



import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter
from app.schemas.flashcard import FlashcardCreate, FlashcardGenerateRequest, FlashcardResponse, FlashcardReview
from app.schemas.common import GenericResponse
from app.services import flashcard_service
from app.utils.i18n import _get_user_lang, not_found_error, t, translate_error
from app.middleware.rate_limiter import api_limiter

logger = logging.getLogger('read-pal.flashcards')


router = APIRouter(prefix='/api/v1/flashcards', tags=['flashcards'], dependencies=[api_limiter])


def _serialize_card(card: object) -> dict:
    """Convert a Flashcard ORM object to a camelCase response dict."""
    return FlashcardResponse.model_validate(card).model_dump(
        mode='json', by_alias=True,
    )


@router.get('', response_model=GenericResponse)
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
            'perPage': per_page,
        },
    }


@router.get('/due', response_model=GenericResponse)
async def get_due_cards(
    book_id: UUID | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Get flashcards due for review."""
    cards = await flashcard_service.get_due_cards(
        db, UUID(user['id']), book_id, limit=limit,
    )
    return {
        'success': True,
        'data': {
            'items': [_serialize_card(c) for c in cards],
            'count': len(cards),
        },
    }


@router.post('', status_code=status.HTTP_201_CREATED, response_model=GenericResponse)
async def create_flashcard(
    body: FlashcardCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a new flashcard."""
    card = await flashcard_service.create_flashcard(db, UUID(user['id']), body)
    return {'success': True, 'data': _serialize_card(card)}


@router.post('/{flashcard_id}/review', response_model=GenericResponse)
async def review_flashcard(
    flashcard_id: UUID,
    body: FlashcardReview,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Review a flashcard using SM-2 algorithm."""
    lang = await _get_user_lang(db, UUID(user['id']))
    try:
        card = await flashcard_service.review_flashcard(
            db, UUID(user['id']), flashcard_id, body.rating,
        )
    except ValueError as exc:
        logger.debug('validation error in flashcards')
        raise not_found_error(translate_error(exc, lang)) from exc
    return {'success': True, 'data': _serialize_card(card)}


# --- Frontend compatibility aliases ---


@router.get('/decks', response_model=GenericResponse)
async def list_decks(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List flashcard decks grouped by book."""
    data = await flashcard_service.list_decks(db, UUID(user['id']))
    return {'success': True, 'data': data}


@router.get('/review', response_model=GenericResponse)
async def review_alias(
    book_id: UUID | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Alias for /due — get cards due for review."""
    cards = await flashcard_service.get_due_cards(
        db, UUID(user['id']), book_id, limit=limit,
    )
    return {
        'success': True,
        'data': {
            'flashcards': [_serialize_card(c) for c in cards],
            'stats': {
                'total': await flashcard_service.count_total(db, UUID(user['id'])),
                'due': len(cards),
                'reviewed': 0,
            },
        },
    }


@router.post('/generate', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def generate_flashcards(
    body: FlashcardGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Generate flashcards for a book."""
    lang = await _get_user_lang(db, UUID(user['id']))
    book_id = body.book_id
    if not book_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'INVALID_INPUT', 'message': t('errors.book_id_required', lang)},
        )
    try:
        cards = await flashcard_service.generate_flashcards(
            db, UUID(user['id']), UUID(book_id),
        )
    except ValueError as exc:
        logger.debug('validation error in flashcards')
        raise not_found_error(translate_error(exc, lang)) from exc
    return {
        'success': True,
        'data': {
            'generated': len(cards),
            'items': [_serialize_card(c) for c in cards],
        },
    }
