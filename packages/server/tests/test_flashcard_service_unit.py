"""Unit tests for flashcard_service — SM-2 algorithm, CRUD, generation logic.

Tests each public function directly with mocked DB session,
isolating the SM-2 spaced repetition math and business logic.
"""

from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services import flashcard_service
from app.services.flashcard_service import DEFAULT_EASE_FACTOR, MIN_EASE_FACTOR


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_flashcard(
    *,
    card_id=None,
    user_id=None,
    book_id=None,
    annotation_id=None,
    question='What is X?',
    answer='X is Y.',
    ease_factor=2.5,
    interval=0,
    repetition_count=0,
    next_review_at=None,
    last_review_at=None,
    last_rating=None,
):
    """Create a mock Flashcard object."""
    card = MagicMock()
    card.id = card_id or uuid4()
    card.user_id = user_id or uuid4()
    card.book_id = book_id or uuid4()
    card.annotation_id = annotation_id
    card.question = question
    card.answer = answer
    card.ease_factor = ease_factor
    card.interval = interval
    card.repetition_count = repetition_count
    card.next_review_at = next_review_at
    card.last_review_at = last_review_at
    card.last_rating = last_rating
    return card


def _make_db_session():
    """Create a mock AsyncSession."""
    return AsyncMock(spec=['execute', 'add', 'flush', 'refresh', 'delete', 'commit', 'rollback', 'in_transaction'])


# ---------------------------------------------------------------------------
# create_flashcard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_flashcard_sets_sm2_defaults():
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()
    annotation_id = uuid4()

    data = MagicMock()
    data.book_id = book_id
    data.annotation_id = annotation_id
    data.question = 'What is the meaning of life?'
    data.answer = '42'

    added_cards = []
    db.add = lambda card: added_cards.append(card)
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    result = await flashcard_service.create_flashcard(db, user_id, data)

    assert len(added_cards) == 1
    card = added_cards[0]
    assert card.user_id == user_id
    assert card.book_id == book_id
    assert card.annotation_id == annotation_id
    assert card.question == 'What is the meaning of life?'
    assert card.answer == '42'
    assert card.ease_factor == DEFAULT_EASE_FACTOR
    assert card.interval == 0
    assert card.repetition_count == 0
    # next_review_at should be set to now (due immediately)
    assert card.next_review_at is not None


@pytest.mark.asyncio
async def test_create_flashcard_without_annotation():
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    data = MagicMock()
    data.book_id = book_id
    data.annotation_id = None
    data.question = 'Q'
    data.answer = 'A'

    added_cards = []
    db.add = lambda card: added_cards.append(card)
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    await flashcard_service.create_flashcard(db, user_id, data)

    assert added_cards[0].annotation_id is None


# ---------------------------------------------------------------------------
# review_flashcard — SM-2 algorithm
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_review_flashcard_first_good_rating():
    """First review with rating >= 3: repetition=1, interval=1."""
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    card = _make_flashcard(
        card_id=card_id,
        user_id=user_id,
        ease_factor=2.5,
        interval=0,
        repetition_count=0,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = card
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=card)

    result = await flashcard_service.review_flashcard(db, user_id, card_id, rating=4)

    assert card.repetition_count == 1
    assert card.interval == 1
    assert card.last_rating == 4
    assert card.ease_factor >= MIN_EASE_FACTOR


@pytest.mark.asyncio
async def test_review_flashcard_second_good_rating():
    """Second review (repetition_count=1): interval becomes 6."""
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    card = _make_flashcard(
        card_id=card_id,
        user_id=user_id,
        ease_factor=2.5,
        interval=1,
        repetition_count=1,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = card
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=card)

    await flashcard_service.review_flashcard(db, user_id, card_id, rating=4)

    assert card.repetition_count == 2
    assert card.interval == 6


@pytest.mark.asyncio
async def test_review_flashcard_third_good_rating_uses_ease_factor():
    """Third+ review: interval = round(previous_interval * ease_factor)."""
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    card = _make_flashcard(
        card_id=card_id,
        user_id=user_id,
        ease_factor=2.5,
        interval=6,
        repetition_count=2,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = card
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=card)

    await flashcard_service.review_flashcard(db, user_id, card_id, rating=4)

    assert card.repetition_count == 3
    assert card.interval == round(6 * 2.5)  # 15


@pytest.mark.asyncio
async def test_review_flashcard_failed_rating_resets():
    """Rating < 3 resets: repetition=0, interval=1."""
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    card = _make_flashcard(
        card_id=card_id,
        user_id=user_id,
        ease_factor=2.5,
        interval=15,
        repetition_count=5,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = card
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=card)

    await flashcard_service.review_flashcard(db, user_id, card_id, rating=1)

    assert card.repetition_count == 0
    assert card.interval == 1
    assert card.last_rating == 1


@pytest.mark.asyncio
async def test_review_flashcard_not_found_raises():
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    # NotFoundError (a ValueError subclass) — pins the 404 semantics
    # instead of the old conflated 400.
    from app.middleware.exception_handlers import NotFoundError
    with pytest.raises(NotFoundError, match='Flashcard not found'):
        await flashcard_service.review_flashcard(db, user_id, card_id, rating=3)


@pytest.mark.asyncio
async def test_review_flashcard_ease_factor_minimum():
    """Ease factor should never drop below MIN_EASE_FACTOR (1.3)."""
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    card = _make_flashcard(
        card_id=card_id,
        user_id=user_id,
        ease_factor=1.3,  # Already at minimum
        interval=1,
        repetition_count=0,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = card
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=card)

    # Rating 0 — worst possible, should try to lower ease factor
    await flashcard_service.review_flashcard(db, user_id, card_id, rating=0)

    assert card.ease_factor >= MIN_EASE_FACTOR


@pytest.mark.asyncio
async def test_review_flashcard_rating_5_max_ease():
    """Perfect rating (5) should increase ease factor."""
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    initial_ef = 2.5
    card = _make_flashcard(
        card_id=card_id,
        user_id=user_id,
        ease_factor=initial_ef,
        interval=0,
        repetition_count=0,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = card
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=card)

    await flashcard_service.review_flashcard(db, user_id, card_id, rating=5)

    # With rating 5: delta = 0.1 - (5-5)*(0.08 + (5-5)*0.02) = 0.1
    assert card.ease_factor == initial_ef + 0.1


@pytest.mark.asyncio
async def test_review_flashcard_rating_3_decreases_ease():
    """Rating 3 (hard pass) should slightly decrease ease factor."""
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    initial_ef = 2.5
    card = _make_flashcard(
        card_id=card_id,
        user_id=user_id,
        ease_factor=initial_ef,
        interval=0,
        repetition_count=0,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = card
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=card)

    await flashcard_service.review_flashcard(db, user_id, card_id, rating=3)

    # Rating 3: delta = 0.1 - (5-3)*(0.08 + (5-3)*0.02) = 0.1 - 2*0.12 = -0.14
    expected_ef = max(MIN_EASE_FACTOR, initial_ef + (0.1 - 2 * (0.08 + 2 * 0.02)))
    assert card.ease_factor == expected_ef


@pytest.mark.asyncio
async def test_review_flashcard_sets_next_review_at():
    """next_review_at should be set to now + interval days."""
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    card = _make_flashcard(
        card_id=card_id,
        user_id=user_id,
        ease_factor=2.5,
        interval=0,
        repetition_count=0,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = card
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=card)

    await flashcard_service.review_flashcard(db, user_id, card_id, rating=4)

    # After review: interval=1, so next_review_at = now + 1 day
    assert card.next_review_at is not None
    assert card.last_review_at is not None


@pytest.mark.asyncio
async def test_review_flashcard_boundary_rating_3_passes():
    """Rating 3 is the boundary — it should pass (not reset)."""
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    card = _make_flashcard(
        card_id=card_id,
        user_id=user_id,
        ease_factor=2.5,
        interval=0,
        repetition_count=0,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = card
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=card)

    await flashcard_service.review_flashcard(db, user_id, card_id, rating=3)

    # Rating 3 >= 3, so it's a pass
    assert card.repetition_count == 1
    assert card.interval == 1


@pytest.mark.asyncio
async def test_review_flashcard_boundary_rating_2_fails():
    """Rating 2 is below threshold — it should fail (reset)."""
    db = _make_db_session()
    user_id = uuid4()
    card_id = uuid4()

    card = _make_flashcard(
        card_id=card_id,
        user_id=user_id,
        ease_factor=2.5,
        interval=6,
        repetition_count=3,
    )

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = card
    db.execute = AsyncMock(return_value=result_mock)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=card)

    await flashcard_service.review_flashcard(db, user_id, card_id, rating=2)

    assert card.repetition_count == 0
    assert card.interval == 1


# ---------------------------------------------------------------------------
# get_due_cards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_due_cards_returns_due():
    db = _make_db_session()
    user_id = uuid4()

    due_cards = [_make_flashcard(user_id=user_id) for _ in range(3)]
    result_mock = MagicMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = due_cards
    result_mock.scalars.return_value = scalars_mock
    db.execute = AsyncMock(return_value=result_mock)

    result = await flashcard_service.get_due_cards(db, user_id)

    assert len(result) == 3


@pytest.mark.asyncio
async def test_get_due_cards_with_book_filter():
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=result_mock)

    result = await flashcard_service.get_due_cards(db, user_id, book_id=book_id)

    assert result == []


@pytest.mark.asyncio
async def test_get_due_cards_respects_limit():
    db = _make_db_session()
    user_id = uuid4()

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = [_make_flashcard()]
    db.execute = AsyncMock(return_value=result_mock)

    result = await flashcard_service.get_due_cards(db, user_id, limit=5)

    assert len(result) == 1


@pytest.mark.asyncio
async def test_get_due_cards_empty():
    db = _make_db_session()
    user_id = uuid4()

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=result_mock)

    result = await flashcard_service.get_due_cards(db, user_id)

    assert result == []


# ---------------------------------------------------------------------------
# list_flashcards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_flashcards_paginated():
    db = _make_db_session()
    user_id = uuid4()

    count_result = MagicMock()
    count_result.scalar.return_value = 25

    data_result = MagicMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [_make_flashcard() for _ in range(10)]
    data_result.scalars.return_value = scalars_mock

    db.execute = AsyncMock(side_effect=[count_result, data_result])

    cards, total = await flashcard_service.list_flashcards(db, user_id, page=2, per_page=10)

    assert total == 25
    assert len(cards) == 10


@pytest.mark.asyncio
async def test_list_flashcards_with_book_filter():
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    count_result = MagicMock()
    count_result.scalar.return_value = 3

    data_result = MagicMock()
    data_result.scalars.return_value.all.return_value = [_make_flashcard(book_id=book_id) for _ in range(3)]

    db.execute = AsyncMock(side_effect=[count_result, data_result])

    cards, total = await flashcard_service.list_flashcards(db, user_id, book_id=book_id)

    assert total == 3
    assert len(cards) == 3


@pytest.mark.asyncio
async def test_list_flashcards_empty():
    db = _make_db_session()
    user_id = uuid4()

    count_result = MagicMock()
    count_result.scalar.return_value = 0

    data_result = MagicMock()
    data_result.scalars.return_value.all.return_value = []

    db.execute = AsyncMock(side_effect=[count_result, data_result])

    cards, total = await flashcard_service.list_flashcards(db, user_id)

    assert total == 0
    assert cards == []


# ---------------------------------------------------------------------------
# list_decks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_decks_groups_by_book():
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    row = MagicMock()
    row.book_id = book_id
    row.book_title = 'Test Book'
    row.author = 'Test Author'
    row.cover_url = 'http://example.com/cover.jpg'
    row.card_count = 5
    row.due_count = 5

    result_mock = MagicMock()
    result_mock.all.return_value = [row]
    db.execute = AsyncMock(return_value=result_mock)

    result = await flashcard_service.list_decks(db, user_id)

    assert result['totalCards'] == 5
    assert result['totalDue'] == 5
    assert len(result['decks']) == 1
    deck = result['decks'][0]
    assert deck['bookId'] == str(book_id)
    assert deck['bookTitle'] == 'Test Book'
    assert deck['author'] == 'Test Author'
    assert deck['total'] == 5


@pytest.mark.asyncio
async def test_list_decks_empty():
    db = _make_db_session()
    user_id = uuid4()

    result_mock = MagicMock()
    result_mock.all.return_value = []
    db.execute = AsyncMock(return_value=result_mock)

    result = await flashcard_service.list_decks(db, user_id)

    assert result['totalCards'] == 0
    assert result['totalDue'] == 0
    assert result['decks'] == []


@pytest.mark.asyncio
async def test_list_decks_multiple_books():
    db = _make_db_session()
    user_id = uuid4()

    row1 = MagicMock()
    row1.book_id = uuid4()
    row1.book_title = 'Book A'
    row1.author = 'Author A'
    row1.cover_url = None
    row1.card_count = 3

    row2 = MagicMock()
    row2.book_id = uuid4()
    row2.book_title = 'Book B'
    row2.author = 'Author B'
    row2.cover_url = None
    row2.card_count = 7

    result_mock = MagicMock()
    result_mock.all.return_value = [row1, row2]
    db.execute = AsyncMock(return_value=result_mock)

    result = await flashcard_service.list_decks(db, user_id)

    assert result['totalCards'] == 10
    assert len(result['decks']) == 2


# ---------------------------------------------------------------------------
# generate_flashcards
# ---------------------------------------------------------------------------


def _no_existing_cards_result():
    """Mock DB result for the flashcard dedup check (no existing cards)."""
    r = MagicMock()
    r.scalar_one_or_none.return_value = None
    return r


@pytest.mark.asyncio
@patch('app.services.flashcard.generation.safe_llm_invoke')
async def test_generate_flashcards_success(mock_llm):
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    # Mock book query
    book = MagicMock()
    book.title = 'Test Book'
    book.author = 'Test Author'

    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book

    # Mock annotation query
    ann1 = MagicMock()
    ann1.type = 'highlight'
    ann1.content = 'Important concept about X'
    ann1.note = None

    ann2 = MagicMock()
    ann2.type = 'note'
    ann2.content = 'More text about Y'
    ann2.note = 'My note on Y'

    ann_result = MagicMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [ann1, ann2]
    ann_result.scalars.return_value = scalars_mock

    # Mock dedup check (no existing cards), book query, annotation query
    dedup_result = MagicMock()
    dedup_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[MagicMock(), dedup_result, book_result, ann_result])

    # Mock LLM response (structured output validated against FlashcardList)
    mock_llm.return_value = {
        'cards': [
            {'question': 'What is X?', 'answer': 'X is a concept.'},
            {'question': 'What is Y?', 'answer': 'Y is related to X.'},
        ]
    }

    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    cards = await flashcard_service.generate_flashcards(db, user_id, book_id, count=2)

    assert len(cards) == 2
    assert cards[0].question == 'What is X?'
    assert cards[0].answer == 'X is a concept.'
    assert cards[0].ease_factor == DEFAULT_EASE_FACTOR
    mock_llm.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_flashcards_book_not_found():
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=book_result)

    with pytest.raises(ValueError, match='Book .* not found'):
        await flashcard_service.generate_flashcards(db, user_id, book_id)


@pytest.mark.asyncio
async def test_generate_flashcards_no_annotations():
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    book = MagicMock()
    book.title = 'Test Book'
    book.author = 'Author'

    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book

    ann_result = MagicMock()
    ann_result.scalars.return_value.all.return_value = []

    db.execute = AsyncMock(side_effect=[MagicMock(), _no_existing_cards_result(), book_result, ann_result])

    with pytest.raises(ValueError, match='No highlights or notes found'):
        await flashcard_service.generate_flashcards(db, user_id, book_id)


@pytest.mark.asyncio
@patch('app.services.flashcard.generation.safe_llm_invoke')
async def test_generate_flashcards_llm_returns_invalid_json(mock_llm):
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    book = MagicMock()
    book.title = 'Test Book'
    book.author = 'Author'

    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book

    ann = MagicMock()
    ann.type = 'highlight'
    ann.content = 'Some content'
    ann.note = None

    ann_result = MagicMock()
    ann_result.scalars.return_value.all.return_value = [ann]

    db.execute = AsyncMock(side_effect=[MagicMock(), _no_existing_cards_result(), book_result, ann_result])
    # safe_llm_invoke returns the FlashcardList fallback on unparseable output
    mock_llm.return_value = {'cards': []}

    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    cards = await flashcard_service.generate_flashcards(db, user_id, book_id)

    assert cards == []


@pytest.mark.asyncio
@patch('app.services.flashcard.generation.safe_llm_invoke')
async def test_generate_flashcards_skips_empty_qa(mock_llm):
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    book = MagicMock()
    book.title = 'Test Book'
    book.author = 'Author'

    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book

    ann = MagicMock()
    ann.type = 'highlight'
    ann.content = 'Some content'
    ann.note = None

    ann_result = MagicMock()
    ann_result.scalars.return_value.all.return_value = [ann]

    db.execute = AsyncMock(side_effect=[MagicMock(), _no_existing_cards_result(), book_result, ann_result])

    # One valid, one with empty question, one with empty answer
    mock_llm.return_value = {'cards': [
        {'question': 'Valid Q?', 'answer': 'Valid A.'},
        {'question': '', 'answer': 'Has answer but no question'},
        {'question': 'Has question', 'answer': ''},
    ]}

    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    cards = await flashcard_service.generate_flashcards(db, user_id, book_id, count=5)

    assert len(cards) == 1
    assert cards[0].question == 'Valid Q?'


@pytest.mark.asyncio
@patch('app.services.flashcard.generation.safe_llm_invoke')
async def test_generate_flashcards_count_clamped_to_max_10(mock_llm):
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    book = MagicMock()
    book.title = 'Test Book'
    book.author = 'Author'

    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book

    ann = MagicMock()
    ann.type = 'highlight'
    ann.content = 'Content'
    ann.note = None

    ann_result = MagicMock()
    ann_result.scalars.return_value.all.return_value = [ann]
    db.execute = AsyncMock(side_effect=[MagicMock(), _no_existing_cards_result(), book_result, ann_result])

    mock_llm.return_value = {'cards': []}
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    # Request 100 cards — should be clamped to 10
    await flashcard_service.generate_flashcards(db, user_id, book_id, count=100)

    # Verify the system prompt mentions exactly 10
    call_args = mock_llm.call_args
    messages = call_args[0][0]
    system_msg = messages[0].content
    assert 'exactly 10 cards' in system_msg


@pytest.mark.asyncio
@patch('app.services.flashcard.generation.safe_llm_invoke')
async def test_generate_flashcards_count_clamped_to_min_1(mock_llm):
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    book = MagicMock()
    book.title = 'Test Book'
    book.author = 'Author'

    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book

    ann = MagicMock()
    ann.type = 'highlight'
    ann.content = 'Content'
    ann.note = None

    ann_result = MagicMock()
    ann_result.scalars.return_value.all.return_value = [ann]
    db.execute = AsyncMock(side_effect=[MagicMock(), _no_existing_cards_result(), book_result, ann_result])

    mock_llm.return_value = {'cards': []}
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    # Request 0 cards — should be clamped to 1
    await flashcard_service.generate_flashcards(db, user_id, book_id, count=0)

    call_args = mock_llm.call_args
    messages = call_args[0][0]
    system_msg = messages[0].content
    assert 'exactly 1 cards' in system_msg


@pytest.mark.asyncio
@patch('app.services.flashcard.generation.safe_llm_invoke')
async def test_generate_flashcards_truncates_long_qa(mock_llm):
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    book = MagicMock()
    book.title = 'Test Book'
    book.author = 'Author'

    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book

    ann = MagicMock()
    ann.type = 'highlight'
    ann.content = 'Content'
    ann.note = None

    ann_result = MagicMock()
    ann_result.scalars.return_value.all.return_value = [ann]
    db.execute = AsyncMock(side_effect=[MagicMock(), _no_existing_cards_result(), book_result, ann_result])

    long_question = 'Q' * 3000
    long_answer = 'A' * 6000
    mock_llm.return_value = {'cards': [
        {'question': long_question, 'answer': long_answer},
    ]}

    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    cards = await flashcard_service.generate_flashcards(db, user_id, book_id)

    assert len(cards) == 1
    assert len(cards[0].question) == 2000  # truncated
    assert len(cards[0].answer) == 5000  # truncated


@pytest.mark.asyncio
@patch('app.services.flashcard.generation.safe_llm_invoke')
async def test_generate_flashcards_llm_returns_none(mock_llm):
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    book = MagicMock()
    book.title = 'Test Book'
    book.author = 'Author'

    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book

    ann = MagicMock()
    ann.type = 'highlight'
    ann.content = 'Content'
    ann.note = None

    ann_result = MagicMock()
    ann_result.scalars.return_value.all.return_value = [ann]
    db.execute = AsyncMock(side_effect=[MagicMock(), _no_existing_cards_result(), book_result, ann_result])

    # safe_llm_invoke returns the fallback when the call fails
    mock_llm.return_value = {'cards': []}

    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    cards = await flashcard_service.generate_flashcards(db, user_id, book_id)

    assert cards == []


@pytest.mark.asyncio
@patch('app.services.flashcard.generation.safe_llm_invoke')
async def test_generate_flashcards_llm_returns_non_list(mock_llm):
    db = _make_db_session()
    user_id = uuid4()
    book_id = uuid4()

    book = MagicMock()
    book.title = 'Test Book'
    book.author = 'Author'

    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book

    ann = MagicMock()
    ann.type = 'highlight'
    ann.content = 'Content'
    ann.note = None

    ann_result = MagicMock()
    ann_result.scalars.return_value.all.return_value = [ann]
    db.execute = AsyncMock(side_effect=[MagicMock(), _no_existing_cards_result(), book_result, ann_result])

    # Return a dict instead of a list
    mock_llm.return_value = {'error': 'something'}

    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    cards = await flashcard_service.generate_flashcards(db, user_id, book_id)

    assert cards == []


@pytest.mark.asyncio
async def test_fetch_book_and_annotations_error_semantics():
    """Book missing -> NotFoundError (404); no highlights -> ValueError (400).

    Pins the split introduced when flashcard generation stopped conflating
    both cases into the router's blanket 404 translation.
    """
    from app.middleware.exception_handlers import NotFoundError
    from app.services.flashcard.generation import _fetch_book_and_annotations

    user_id, book_id = uuid4(), uuid4()

    # Book not found
    db = _make_db_session()
    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=book_result)
    with pytest.raises(NotFoundError):
        await _fetch_book_and_annotations(db, user_id, book_id)

    # Book exists but no highlights/notes
    db = _make_db_session()
    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = MagicMock()
    ann_result = MagicMock()
    ann_result.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(side_effect=[book_result, ann_result])
    with pytest.raises(ValueError, match='No highlights or notes') as exc_info:
        await _fetch_book_and_annotations(db, user_id, book_id)
    assert not isinstance(exc_info.value, NotFoundError)
