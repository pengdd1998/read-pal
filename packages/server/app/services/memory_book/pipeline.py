"""Main generation pipeline for Reading Mirror."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, UTC
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.memory_book import MemoryBook
from app.schemas.memory_book import MemoryBookResponse
from app.services.memory_book.checkpoint import (
    clear_checkpoint,
    load_checkpoint,
    save_section,
)
from app.services.memory_book.data_collection import _collect_enriched_data
from app.services.memory_book.renderer import _render_html
from app.services.memory_book.section_generation import (
    SECTION_TYPES,
    _generate_reader_became_best_of_n,
    _generate_section,
    _placeholder_section,
)
from app.utils.i18n import t

from app.db import release_db

logger = structlog.get_logger('read-pal.memory_book')

# Sections that use LLM generation
_LLM_SECTIONS = frozenset({
    'encounter', 'highlights', 'recommendations',
    'conversations', 'annotations_woven',
    'attention_map', 'what_stuck', 'concept_web',
    'threads', 'reader_became',
})

# Sections that require specific source data before invoking the LLM, to avoid
# hallucinating content from empty inputs. Maps section type ->
# (predicate, placeholder_title, message_key). When the predicate is falsy the
# section renders a placeholder instead of calling the LLM.
def _has_annotations(d: dict[str, Any]) -> bool:
    return bool(d.get('highlights') or d.get('notes'))


_SECTION_DATA_REQUIRED: dict[str, tuple[Any, str, str]] = {
    'highlights': (_has_annotations, 'No Annotations Yet', 'memory_book.no_annotations_message'),
    'annotations_woven': (_has_annotations, 'No Annotations Yet', 'memory_book.no_annotations_message'),
    'conversations': (
        lambda d: bool(d.get('conversations')),
        'No Conversations Yet', 'memory_book.placeholder_message',
    ),
    'what_stuck': (
        lambda d: bool(d.get('flashcards')),
        'No Flashcards Yet', 'memory_book.placeholder_message',
    ),
    'concept_web': (
        lambda d: bool(d.get('concepts') or d.get('concept_edges')),
        'No Concepts Yet', 'memory_book.placeholder_message',
    ),
    'threads': (
        lambda d: bool(d.get('other_books')),
        'No Other Books Yet', 'memory_book.placeholder_message',
    ),
}


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
    existing_by_type: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Generate all sections in parallel and add metadata.

    ``existing_by_type`` lets regeneration be incremental: a section that
    already succeeded on a prior run (no ``error``) is reused as-is instead of
    burning another LLM call. Under GLM rate-limiting a full 10-section
    regenerate can take minutes and is likely to fail some sections; re-running
    then re-attempts ALL of them, so a previously-good section can regress to
    an error stub. Incremental regeneration is monotonic — each retry only
    fills in the missing sections, never losing what already succeeded.
    """
    existing_by_type = existing_by_type or {}

    # P3.3: layer Redis checkpoints under the existing DB-derived
    # ``existing_by_type``. The DB layer only catches "completed prior
    # runs"; the checkpoint catches "interrupted prior runs" — sections
    # that completed in-process but never made it to the DB row because
    # the worker died (OOM, deploy, restart). DB wins on conflicts
    # because it represents the user's last fully-persisted mirror.
    checkpointed = await load_checkpoint(user_id, book_id)
    for section_type, section_data in checkpointed.items():
        existing_by_type.setdefault(section_type, section_data)

    async def _gen_section(section_type: str) -> dict[str, Any]:
        # Reuse a previously-successful section verbatim (deep copy so the
        # stored row isn't aliased). Sections carrying an `error` are the
        # ones we want to retry.
        prior = existing_by_type.get(section_type)
        if prior and not prior.get('error'):
            reused = {**prior}
            reused.pop('id', None)  # id is re-assigned by position below
            return reused
        try:
            requirement = _SECTION_DATA_REQUIRED.get(section_type)
            if requirement is not None:
                predicate, placeholder_title, message_key = requirement
                if not predicate(enriched_data):
                    return {
                        'type': section_type,
                        'title': placeholder_title,
                        'message': t(message_key),
                    }
            if section_type in _LLM_SECTIONS:
                # P2.4: reader_became is the closing reflective essay and
                # runs once per book completion. Route through Best-of-N to
                # reduce variance and flag hallucination divergence on the
                # most prominent section. Other sections stay single-shot
                # — 3x cost is unjustified for less prominent outputs.
                if section_type == 'reader_became':
                    result = await _generate_reader_became_best_of_n(
                        enriched_data, user_id=user_id, book_id=book_id,
                    )
                else:
                    result = await _generate_section(
                        section_type, enriched_data,
                        user_id=user_id, book_id=book_id,
                    )
            else:
                result = _placeholder_section(section_type)
        except Exception as exc:
            logger.warning(
                'section_generation_failed',
                section_type=section_type,
                book_id=str(book_id),
                user_id=str(user_id),
                error=str(exc),
                exc_info=True,
            )
            result = {'type': section_type, 'error': 'Generation failed'}

        # P3.3: persist this section the moment it completes so an
        # interrupted run can resume from here. Errors are checkpointed
        # too — see checkpoint.save_section docstring for why.
        await save_section(user_id, book_id, section_type, result)
        return result

    section_results = await asyncio.gather(
        *[_gen_section(st) for st in SECTION_TYPES]
    )

    now = datetime.now(tz=UTC).isoformat()
    sections: list[dict[str, Any]] = []
    for idx, section_data in enumerate(section_results):
        section_type = SECTION_TYPES[idx]
        section_data['id'] = f'section-{idx + 1}'
        section_data.setdefault('type', section_type)
        section_data['generated_at'] = now
        sections.append(section_data)
    return sections


async def _update_existing_memory_book(
    db: AsyncSession,
    existing: MemoryBook,
    sections: list[dict[str, Any]],
    stats: dict[str, Any],
    html_content: str,
    book_format: str,
    mirror_title: str,
) -> MemoryBook:
    """Update an existing MemoryBook row in place."""
    await db.execute(
        update(MemoryBook)
        .where(MemoryBook.id == existing.id)
        .values(
            sections=sections,
            stats=stats,
            html_content=html_content,
            format=book_format,
            title=mirror_title,
            version=MemoryBook.version + 1,
        )
    )
    await db.refresh(existing)
    return existing


async def _create_new_memory_book(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    sections: list[dict[str, Any]],
    stats: dict[str, Any],
    html_content: str,
    book_format: str,
    mirror_title: str,
) -> MemoryBook:
    """Insert a new MemoryBook row and return the ORM object."""
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


async def _load_existing_sections(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[dict[str, Any]]:
    """Return the sections list of the user's existing mirror, or [] if none.

    Read-only (no FOR UPDATE) so it doesn't contend with the upsert lock.
    Used to make regeneration incremental — successful sections are reused.
    """
    result = await db.execute(
        select(MemoryBook.sections).where(
            MemoryBook.user_id == user_id,
            MemoryBook.book_id == book_id,
        )
    )
    sections = result.scalar_one_or_none()
    if not sections:
        return []
    return [s for s in sections if isinstance(s, dict)]


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
    """Insert or update the MemoryBook row and return the ORM object.

    Uses ``SELECT ... FOR UPDATE`` so concurrent generate requests for the
    same (user_id, book_id) serialize. Without this, two parallel POSTs could
    both see "no existing row", both INSERT, and one would 500 on the unique
    constraint ``uq_memory_books_user_book``.
    """
    result = await db.execute(
        select(MemoryBook)
        .where(
            MemoryBook.user_id == user_id,
            MemoryBook.book_id == book_id,
        )
        .with_for_update(),
    )
    existing = result.scalar_one_or_none()

    book_title = enriched_data.get('book', {}).get('title', 'Untitled Book')
    mirror_title = f'{book_title} — Reading Mirror'

    if existing:
        return await _update_existing_memory_book(
            db, existing, sections, stats,
            html_content, book_format, mirror_title,
        )

    return await _create_new_memory_book(
        db, user_id, book_id, sections, stats,
        html_content, book_format, mirror_title,
    )


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

    # Load any prior mirror so regeneration is incremental: reuse sections
    # that already succeeded, only re-call the LLM for ones that errored.
    existing_by_type: dict[str, dict[str, Any]] = {}
    try:
        prior = await _load_existing_sections(db, user_id, book_id)
        if prior:
            existing_by_type = {s.get('type'): s for s in prior if s.get('type')}
    except Exception:
        logger.warning('memory_book.load_existing_failed', book_id=str(book_id), exc_info=True)

    # Section generation fans out to parallel LLM calls (minutes). Release
    # the pooled connection + idle read txn — the final upsert re-checkouts.
    await release_db(db)
    sections = await _generate_all_sections(
        enriched_data, user_id, book_id, existing_by_type=existing_by_type,
    )
    stats = enriched_data.get('stats', {})
    html_content = _render_html(enriched_data, sections, stats)

    memory_book = await _upsert_memory_book(
        db, user_id, book_id, sections, stats, html_content,
        enriched_data, book_format,
    )

    # P3.3: DB row is now the source of truth — drop the Redis checkpoint
    # so the next run reads fresh state from the DB instead of stale
    # state from Redis. Failures here are non-fatal (TTL will reclaim
    # the key eventually); clear_checkpoint logs internally.
    await clear_checkpoint(user_id, book_id)

    elapsed = (time.monotonic() - t0) * 1000
    html_size_kb = round(len(html_content.encode('utf-8')) / 1024, 1) if html_content else 0
    # Count sections actually reused from the prior run (non-error prior that
    # skipped a fresh LLM call) vs. freshly generated this run.
    reused = sum(
        1 for s in sections
        if s.get('type') in existing_by_type
        and not existing_by_type[s['type']].get('error')
    )
    logger.info(
        'memory_book.generate.completed',
        book_id=str(book_id),
        chapter_count=len(sections),
        reused_sections=reused,
        total_size_kb=html_size_kb,
        latency_ms=round(elapsed, 1),
    )

    return MemoryBookResponse.model_validate(memory_book)
