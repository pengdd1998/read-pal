"""Seed service — auto-seed sample data for new users."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book, BookFileType, BookStatus


async def seed_sample_data(db: AsyncSession, user_id: UUID) -> Book:
    """Create a sample book with annotations so new users see content immediately."""
    sample = Book(
        user_id=user_id,
        title='The Great Gatsby',
        author='F. Scott Fitzgerald',
        file_type=BookFileType.epub,
        file_size=2048,
        total_pages=180,
        current_page=45,
        status=BookStatus.reading,
        progress=25,
        tags=['sample', 'classic', 'fiction'],
    )
    db.add(sample)
    await db.flush()

    sample_annotations = [
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='In my younger and more vulnerable years my father gave me some advice '
                    "that I've been turning over in my mind ever since.",
            location={'page': 1, 'chapter': 1},
            note='Famous opening lines — sets the tone for Nick as unreliable narrator',
            tags=['opening', 'narrator', 'key-quote'],
            color='#ffeb3b',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='Gatsby believed in the green light, the orgastic future that year by year recedes before us.',
            location={'page': 180, 'chapter': 9},
            note='The green light symbolizes the American Dream — always out of reach',
            tags=['symbolism', 'american-dream', 'ending'],
            color='#4caf50',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='I was within and without, simultaneously enchanted and repelled by the '
                    'inexhaustible variety of life.',
            location={'page': 35, 'chapter': 2},
            note="Nick's ambivalence — he is both participant and observer",
            tags=['narrator', 'duality', 'key-quote'],
            color='#ffeb3b',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.note,
            content='The eyes of Doctor T.J. Eckleburg watch over the Valley of Ashes — '
                    'God watching moral decay?',
            location={'page': 23, 'chapter': 2},
            tags=['symbolism', 'morality', 'eyes'],
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.note,
            content="Gatsby's parties represent the excess and emptiness of the Jazz Age. "
                    'Everyone comes but nobody truly knows him.',
            location={'page': 40, 'chapter': 3},
            tags=['theme', 'jazz-age', 'character'],
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='So we beat on, boats against the current, borne back ceaselessly into the past.',
            location={'page': 180, 'chapter': 9},
            note='Final line — we are all chasing dreams that pull us backward',
            tags=['ending', 'time', 'key-quote'],
            color='#ff9800',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.bookmark,
            content='Chapter 4: Gatsby tells Nick about his past',
            location={'page': 60, 'chapter': 4},
        ),
    ]
    db.add_all(sample_annotations)

    return sample
