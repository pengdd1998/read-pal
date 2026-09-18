"""Shared test seed symbols (M2.1 hoist).

Cross-test imports like ``from tests.test_research_agent import _seed_book``
put shared fixtures inside random test modules — a structural hazard the
tests/ mirror split would trip over. The symbols live here instead; the
origin modules re-import them so existing call sites stay unchanged.
"""

from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy import text

# RAG needle used by research/companion/synthesis suites.
_NEEDLE = '唯一研究词xyz'


async def _seed_user(session) -> str:
    uid = uuid4()
    # PG enforces FKs — insert the owner row before books.
    await session.execute(
        text(
            'INSERT INTO users (id, email, password_hash, name, created_at, updated_at) '
            "VALUES (:u, :e, 'h', 'S', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ),
        {'u': uid, 'e': f'{uid}@research-test'},
    )
    return uid


async def _seed_book(
    session,
    uid,
    *,
    title,
    chunks,
    status='completed',
    current_page=None,
    current_segment=None,
) -> str:
    """Seed one book + document + chunks; returns the book id (str UUID)."""
    from app.models.book import Book, BookFileType
    from app.models.book_chunk import BookChunk
    from app.models.document import Document

    book_id = uuid4()
    doc_id = uuid4()
    session.add(
        Book(
            id=book_id,
            user_id=uid,
            title=title,
            author='Author',
            file_type=BookFileType.epub,
            file_size=1,
            total_pages=100,
            status=status,
            current_page=current_page or 0,
            current_segment=current_segment or 0,
        )
    )
    session.add(
        Document(
            id=doc_id,
            book_id=book_id,
            user_id=uid,
            content='x',
            chapters=[],
        )
    )
    await session.flush()
    session.add_all(
        [
            BookChunk(
                book_id=book_id,
                document_id=doc_id,
                chapter_index=chapter_index,
                chunk_index=0,
                content=content,
            )
            for chapter_index, content in chunks
        ]
    )
    await session.commit()
    return str(book_id)


@dataclass
class FakeBook:
    """Minimal Book stand-in — only the fields build_system_prompt reads."""

    title: str = 'Test Book'
    author: str = 'Test Author'
    progress: float = 50.0
    current_page: int = 100
    total_pages: int = 200
    current_segment: int = 5
    status: str = 'reading'
