"""Seed service — auto-seed sample data for new users."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone as _tz
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book, BookFileType, BookStatus
from app.models.document import Document
from app.models.reading_session import ReadingSession

from app.services._seed_data import GATSBY_CHAPTERS, _ANNOTATION_TEMPLATES

logger = logging.getLogger('read-pal.seed')

# Pre-built Great Gatsby concepts (avoids needing an LLM call at first load)
GATSBY_CONCEPTS = [
    {'name': 'The Green Light', 'type': 'symbol', 'related': ['American Dream', 'Gatsby', 'Daisy Buchanan', 'Hope']},
    {'name': 'American Dream', 'type': 'theme', 'related': ['The Green Light', 'Wealth', 'Gatsby', 'Social Class']},
    {'name': 'Gatsby', 'type': 'character', 'related': ['The Green Light', 'Daisy Buchanan', 'Wealth', 'Jay Gatsby']},
    {'name': 'Daisy Buchanan', 'type': 'character', 'related': ['Gatsby', 'The Green Light', 'Tom Buchanan', 'Love']},
    {'name': 'Nick Carraway', 'type': 'character', 'related': ['Gatsby', 'Daisy Buchanan', 'Narrator', 'Moral Decay']},
    {'name': 'Tom Buchanan', 'type': 'character', 'related': ['Daisy Buchanan', 'Wealth', 'Moral Decay', 'Social Class']},
    {'name': 'Valley of Ashes', 'type': 'setting', 'related': ['Moral Decay', 'Doctor T.J. Eckleburg', 'Social Class']},
    {'name': 'Doctor T.J. Eckleburg', 'type': 'symbol', 'related': ['Valley of Ashes', 'Moral Decay', 'God']},
    {'name': 'Moral Decay', 'type': 'theme', 'related': ['Valley of Ashes', 'Tom Buchanan', 'Jazz Age', 'Doctor T.J. Eckleburg']},
    {'name': 'Wealth', 'type': 'theme', 'related': ['Gatsby', 'Tom Buchanan', 'American Dream', 'Social Class']},
    {'name': 'Social Class', 'type': 'theme', 'related': ['Wealth', 'Tom Buchanan', 'Valley of Ashes', 'American Dream']},
    {'name': 'Jazz Age', 'type': 'theme', 'related': ['Moral Decay', 'Gatsby', 'Wealth', 'Excess']},
    {'name': 'Hope', 'type': 'theme', 'related': ['The Green Light', 'American Dream', 'Gatsby']},
    {'name': 'Love', 'type': 'theme', 'related': ['Gatsby', 'Daisy Buchanan', 'The Green Light']},
    {'name': 'Narrator', 'type': 'concept', 'related': ['Nick Carraway', 'Unreliable Narrator', 'Perspective']},
    {'name': 'Unreliable Narrator', 'type': 'concept', 'related': ['Nick Carraway', 'Narrator', 'Perspective']},
    {'name': 'Perspective', 'type': 'concept', 'related': ['Nick Carraway', 'Unreliable Narrator', 'Duality']},
    {'name': 'Duality', 'type': 'concept', 'related': ['Nick Carraway', 'Perspective', 'Moral Decay']},
    {'name': 'Excess', 'type': 'theme', 'related': ['Jazz Age', 'Wealth', 'Gatsby']},
    {'name': 'Time', 'type': 'theme', 'related': ['Gatsby', 'The Green Light', 'American Dream', 'Past']},
    {'name': 'Past', 'type': 'theme', 'related': ['Time', 'Gatsby', 'Daisy Buchanan']},
    {'name': 'Jay Gatsby', 'type': 'character', 'related': ['Gatsby', 'American Dream', 'Wealth', 'The Green Light']},
    {'name': 'God', 'type': 'concept', 'related': ['Doctor T.J. Eckleburg', 'Moral Decay', 'Valley of Ashes']},
]


async def _create_sample_book(db: AsyncSession, user_id: UUID) -> Book:
    """Create the sample Great Gatsby book with its Document."""
    sample = Book(
        user_id=user_id,
        title='The Great Gatsby',
        author='F. Scott Fitzgerald',
        file_type=BookFileType.epub,
        file_size=2048,
        total_pages=len(GATSBY_CHAPTERS),
        current_page=1,
        status=BookStatus.reading,
        progress=20,
        tags=['sample', 'classic', 'fiction'],
        metadata_={
            'year': 1925,
            'publisher': "Charles Scribner's Sons",
            'isbn': '978-0-7432-7356-5',
            'genre': 'Fiction',
            'language': 'English',
        },
    )
    db.add(sample)
    await db.flush()
    await db.refresh(sample)

    full_content = '\n'.join(ch['content'] for ch in GATSBY_CHAPTERS)
    doc = Document(
        book_id=sample.id,
        user_id=user_id,
        content=full_content,
        chapters=GATSBY_CHAPTERS,
    )
    db.add(doc)
    return sample


def _build_annotation(
    user_id: UUID,
    book_id: UUID,
    template: tuple[str, str, dict, str | None, list[str], str | None],
) -> Annotation:
    """Convert a single annotation template tuple into an Annotation ORM object."""
    ann_type_str, content, location, note, tags, color = template
    return Annotation(
        user_id=user_id,
        book_id=book_id,
        type=AnnotationType(ann_type_str),
        content=content,
        location=location,
        note=note,
        tags=tags,
        color=color,
    )


def _create_sample_annotations(user_id: UUID, book_id: UUID) -> list[Annotation]:
    """Build the list of pre-built Gatsby annotations."""
    return [
        _build_annotation(user_id, book_id, tpl)
        for tpl in _ANNOTATION_TEMPLATES
    ]


def _create_sample_session(user_id: UUID, book_id: UUID) -> ReadingSession:
    """Build a completed reading session for dashboard stats."""
    session_start = datetime.now(_tz.utc) - timedelta(minutes=20)
    return ReadingSession(
        user_id=user_id,
        book_id=book_id,
        started_at=session_start,
        ended_at=session_start + timedelta(minutes=15),
        duration=900,
        pages_read=1,
        highlights=5,
        notes=2,
        is_active=False,
    )


async def seed_sample_data(db: AsyncSession, user_id: UUID) -> Book:
    """Create a sample book with annotations so new users see content immediately."""
    sample = await _create_sample_book(db, user_id)
    db.add_all(_create_sample_annotations(user_id, sample.id))
    db.add(_create_sample_session(user_id, sample.id))
    await _seed_graph_cache(user_id, sample.id)
    return sample


async def _seed_graph_cache(user_id: UUID, book_id: UUID) -> None:
    """Write pre-built Gatsby graph data into Redis so the knowledge page renders immediately."""
    try:
        from app.core.redis import get_redis
        from app.services.knowledge_service import GRAPH_KEY_PREFIX as GRAPH_CACHE_PREFIX, _knowledge_cache_ttl

        nodes: list[dict] = []
        edges: list[dict] = []
        seen_edges: set[tuple[str, str]] = set()

        for concept in GATSBY_CONCEPTS:
            name = concept['name']
            nodes.append({
                'id': name,
                'label': name,
                'type': concept['type'],
                'size': 1,
                'metadata': {'bookId': str(book_id)},
            })
            for related in concept.get('related', []):
                edge_key = tuple(sorted([name, related]))
                if edge_key not in seen_edges:
                    seen_edges.add(edge_key)
                    edges.append({
                        'source': name,
                        'target': related,
                        'label': 'related',
                        'weight': 1.0,
                    })

        graph_data = {'nodes': nodes, 'edges': edges}
        cache_key = f'{GRAPH_CACHE_PREFIX}{user_id}:{book_id}:graph'
        r = get_redis()
        await r.setex(cache_key, _knowledge_cache_ttl(), json.dumps(graph_data))
        logger.info(
            'Seeded knowledge graph cache for book %s (%d nodes, %d edges)',
            book_id, len(nodes), len(edges),
        )
    except Exception as exc:
        logger.warning('Failed to seed knowledge graph cache', exc_info=True)
