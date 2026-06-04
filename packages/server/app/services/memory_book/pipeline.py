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

# Sections that use LLM generation
_LLM_SECTIONS = frozenset({
    'encounter', 'highlights', 'recommendations',
    'conversations', 'annotations_woven',
    'attention_map', 'what_stuck', 'concept_web',
    'threads', 'reader_became',
})


async def _collect_and_validate(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect enriched data and raise if the book is missing."""
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
    return enriched_data


async def _generate_all_sections(
    enriched_data: dict[str, Any],
    user_id: UUID,
    book_id: UUID,
) -> list[dict[str, Any]]:
    """Generate all sections in parallel and add metadata."""
    async def _gen_section(section_type: str) -> dict[str, Any]:
        try:
            if section_type in _LLM_SECTIONS:
                return await _generate_section(
                    section_type, enriched_data,
                    user_id=user_id, book_id=book_id,
                )
            return _placeholder_section(section_type)
        except Exception as exc:
            logger.warning(
                'section_generation_failed',
                section_type=section_type,
                book_id=str(book_id),
                user_id=str(user_id),
                error=str(exc),
                exc_info=True,
            )
            return {'type': section_type, 'error': 'Generation failed'}

    section_results = await asyncio.gather(
        *[_gen_section(st) for st in SECTION_TYPES]
    )

    now = datetime.now(tz=timezone.utc).isoformat()
    sections: list[dict[str, Any]] = []
    for idx, section_data in enumerate(section_results):
        section_type = SECTION_TYPES[idx]
        section_data['id'] = f'section-{idx + 1}'
        section_data.setdefault('type', section_type)
        section_data['generated_at'] = now
        sections.append(section_data)
    return sections


async def _upsert_memory_book(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    sections: list[dict[str, Any]],
    stats: dict[str, Any],
    html_content: str,
    enriched_data: dict[str, Any],
    book_format: str,
) -> MemoryBook:
    """Insert or update the MemoryBook row and return the ORM object."""
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
        return existing

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
    return memory_book


async def generate(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    book_format: str = 'reading_mirror',
) -> MemoryBookResponse:
    """Generate a 10-section Reading Mirror.

    All 10 sections are LLM-generated with enriched prompts:
    encounter, attention_map, highlights, annotations_woven, conversations,
    concept_web, what_stuck, threads, reader_became, recommendations.
    """
    t0 = time.monotonic()
    logger.info(
        'memory_book.generate.started',
        book_id=str(book_id),
        user_id=str(user_id),
        book_format=book_format,
    )

    enriched_data = await _collect_and_validate(db, user_id, book_id)
    sections = await _generate_all_sections(enriched_data, user_id, book_id)
    stats = enriched_data.get('stats', {})
    html_content = _render_html(enriched_data, sections, stats)

    memory_book = await _upsert_memory_book(
        db, user_id, book_id, sections, stats, html_content,
        enriched_data, book_format,
    )

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
