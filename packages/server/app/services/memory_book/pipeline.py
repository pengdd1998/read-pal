"""Main generation pipeline for Reading Mirror."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.memory_book import MemoryBook
from app.schemas.memory_book import MemoryBookResponse
from app.services.memory_book.data_collection import _collect_enriched_data
from app.services.memory_book.renderer import _render_html
from app.services.memory_book.section_generation import (
    SECTION_TYPES,
    _generate_section,
    _placeholder_section,
)

logger = structlog.get_logger('read-pal.memory_book')


async def generate(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    book_format: str = 'reading_mirror',
) -> MemoryBookResponse:
    """Generate a 10-section Reading Mirror.

    Sections 1, 3, 10 are LLM-generated with enriched prompts.
    Sections 2, 4, 5, 6, 7, 8, 9 are placeholders for Phase 2.
    """
    t0 = time.monotonic()
    logger.info(
        'memory_book.generate.started',
        book_id=str(book_id),
        user_id=str(user_id),
        book_format=book_format,
    )

    enriched_data = await _collect_enriched_data(db, user_id, book_id)
    if not enriched_data.get('book'):
        raise ValueError('Book not found')

    stats = enriched_data.get('stats', {})
    logger.info(
        'memory_book.generate.data_collected',
        book_id=str(book_id),
        highlights_count=stats.get('total_highlights', 0),
        notes_count=stats.get('total_notes', 0),
        sessions_count=stats.get('total_sessions', 0),
    )

    # Sections that use LLM generation
    llm_sections = {
        'encounter', 'highlights', 'recommendations',
        'conversations', 'annotations_woven',
        'attention_map', 'what_stuck', 'concept_web',
        'threads', 'reader_became',
    }

    async def _gen_section(section_type: str) -> dict[str, Any]:
        try:
            if section_type in llm_sections:
                return await _generate_section(section_type, enriched_data, user_id=user_id, book_id=book_id)
            else:
                return _placeholder_section(section_type)
        except Exception:
            logger.exception('section_generation_failed', section_type=section_type)
            return {'type': section_type, 'error': 'Generation failed'}

    section_results = await asyncio.gather(
        *[_gen_section(st) for st in SECTION_TYPES]
    )

    sections: list[dict[str, Any]] = []
    now = datetime.now(tz=timezone.utc).isoformat()
    for idx, section_data in enumerate(section_results):
        section_type = SECTION_TYPES[idx]
        section_data['id'] = f'section-{idx + 1}'
        section_data.setdefault('type', section_type)
        section_data['generated_at'] = now
        sections.append(section_data)

    stats = enriched_data.get('stats', {})

    # Render legacy HTML for mobile compat
    html_content = _render_html(enriched_data, sections, stats)

    # Upsert
    result = await db.execute(
        select(MemoryBook).where(
            MemoryBook.user_id == user_id,
            MemoryBook.book_id == book_id,
        ),
    )
    existing = result.scalar_one_or_none()

    book_title = enriched_data['book']['title']
    mirror_title = f'{book_title} — Reading Mirror'

    if existing:
        existing.sections = sections
        existing.stats = stats
        existing.html_content = html_content
        existing.format = book_format
        existing.title = mirror_title
        existing.version = (existing.version or 1) + 1
        await db.flush()
        memory_book = existing
    else:
        memory_book = MemoryBook(
            user_id=user_id,
            book_id=book_id,
            title=mirror_title,
            format=book_format,
            sections=sections,
            stats=stats,
            html_content=html_content,
        )
        db.add(memory_book)
        await db.flush()
        await db.refresh(memory_book)

    elapsed = (time.monotonic() - t0) * 1000
    html_size_kb = round(len(html_content.encode('utf-8')) / 1024, 1) if html_content else 0
    logger.info(
        'memory_book.generate.completed',
        book_id=str(book_id),
        chapter_count=len(sections),
        total_size_kb=html_size_kb,
        latency_ms=round(elapsed, 1),
    )

    return MemoryBookResponse.model_validate(memory_book)
