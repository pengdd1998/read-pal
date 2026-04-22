"""Memory book service — 6-chapter Personal Reading Book generation."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.memory_book import MemoryBook
from app.models.reading_session import ReadingSession
from app.prompts import MEMORY_BOOK_CHAPTERS, MEMORY_BOOK_SYSTEM
from app.schemas.llm_outputs import (
    ConversationsData,
    CoverData,
    HighlightsData,
    LookingForwardData,
    NotesData,
    ReadingJourneyData,
)
from app.schemas.memory_book import MemoryBookResponse
from app.services.llm import safe_llm_invoke
from app.utils.annotations import match_annotation_type
from app.utils.sanitizer import sanitize_user_input
from app.utils.token_budget import TokenBudget

logger = logging.getLogger('read-pal.memory_book')

# Map each chapter number to its Pydantic output schema
CHAPTER_SCHEMAS: dict[int, type] = {
    1: CoverData,
    2: ReadingJourneyData,
    3: HighlightsData,
    4: NotesData,
    5: ConversationsData,
    6: LookingForwardData,
}


async def _collect_book_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect all data needed for memory book generation."""
    data: dict[str, Any] = {}
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id),
    )
    book = result.scalar_one_or_none()
    if book is None:
        return data

    data['book'] = {
        'id': str(book.id), 'title': book.title, 'author': book.author,
        'cover_url': book.cover_url, 'progress': float(book.progress),
        'status': book.status,
        'started_at': book.started_at.isoformat() if book.started_at else None,
        'completed_at': book.completed_at.isoformat() if book.completed_at else None,
    }
    # Annotations (capped at 500)
    result = await db.execute(
        select(Annotation)
        .where(Annotation.user_id == user_id, Annotation.book_id == book_id)
        .order_by(Annotation.created_at)
        .limit(500),
    )
    annotations = list(result.scalars().all())
    data['highlights'] = [
        {
            'content': sanitize_user_input(a.content, context='highlight_content'),
            'note': sanitize_user_input(a.note or '', context='highlight_note'),
            'tags': a.tags, 'location': a.location,
        }
        for a in annotations if match_annotation_type(a.type, AnnotationType.highlight)
    ]
    data['notes'] = [
        {
            'content': sanitize_user_input(a.content, context='note_content'),
            'note': sanitize_user_input(a.note or '', context='note_text'),
            'tags': a.tags,
        }
        for a in annotations if match_annotation_type(a.type, AnnotationType.note)
    ]
    # Chat messages (capped at 200)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.book_id == book_id)
        .order_by(ChatMessage.created_at)
        .limit(200),
    )
    messages = list(result.scalars().all())
    data['conversations'] = [
        {
            'role': m.role,
            'content': sanitize_user_input(m.content, context='chat_message'),
        }
        for m in messages
    ]
    # Reading sessions (capped at 100)
    result = await db.execute(
        select(ReadingSession)
        .where(ReadingSession.user_id == user_id, ReadingSession.book_id == book_id)
        .order_by(ReadingSession.started_at)
        .limit(100),
    )
    sessions = list(result.scalars().all())
    data['reading_sessions'] = [
        {'started_at': s.started_at.isoformat() if s.started_at else None,
         'duration': s.duration, 'pages_read': s.pages_read,
         'highlights': s.highlights, 'notes': s.notes}
        for s in sessions
    ]
    data['stats'] = {
        'total_highlights': len(data['highlights']),
        'total_notes': len(data['notes']),
        'total_conversations': len(data['conversations']),
        'total_sessions': len(sessions),
        'total_reading_minutes': sum(s.duration for s in sessions) // 60,
        'total_pages_read': sum(s.pages_read for s in sessions),
    }
    return data


def _prepare_relevant_data(
    chapter_num: int,
    book_data: dict[str, Any],
    budget: TokenBudget,
) -> dict[str, Any]:
    """Select and budget the relevant data slice for a given chapter."""
    if chapter_num == 1:
        return book_data.get('stats', {})
    elif chapter_num == 2:
        raw = book_data.get('reading_sessions', [])
        return _budget_list(raw, budget, 'reading_sessions')
    elif chapter_num == 3:
        raw = book_data.get('highlights', [])[:30]
        return _budget_list(raw, budget, 'highlights')
    elif chapter_num == 4:
        raw = book_data.get('notes', [])[:30]
        return _budget_list(raw, budget, 'notes')
    elif chapter_num == 5:
        raw = book_data.get('conversations', [])[:30]
        return _budget_list(raw, budget, 'conversations')
    elif chapter_num == 6:
        return {
            'themes': _budget_list(
                book_data.get('highlights', [])[:10], budget, 'themes_highlights',
            ),
            'notes': _budget_list(
                book_data.get('notes', [])[:10], budget, 'themes_notes',
            ),
        }
    return {}


def _budget_list(
    items: list[dict[str, Any]],
    budget: TokenBudget,
    label: str,
) -> list[dict[str, Any]]:
    """Trim a list of dicts to fit within the token budget."""
    result: list[dict[str, Any]] = []
    for item in items:
        text = json.dumps(item, default=str)
        if budget.check_fits(text):
            budget.add(text, label=f'{label}[{len(result)}]')
            result.append(item)
        else:
            break
    return result


async def _generate_chapter(
    chapter_num: int,
    book_data: dict[str, Any],
    book_format: str,
) -> dict[str, Any]:
    """Generate a single chapter via LLM."""
    chapter_template = MEMORY_BOOK_CHAPTERS.get(chapter_num)
    if chapter_template is None:
        logger.warning('No template for chapter %d', chapter_num)
        return {
            'chapter': chapter_num,
            'title': f'Chapter {chapter_num}',
            'error': 'No template defined for this chapter.',
        }

    book_title = book_data.get('book', {}).get('title', 'Unknown')
    book_author = book_data.get('book', {}).get('author', 'Unknown')

    system_prompt = MEMORY_BOOK_SYSTEM.template.format(
        book_title=book_title,
        book_author=book_author,
        book_format=book_format,
        chapter_prompt=chapter_template.template,
    )

    # Token-budget the data payload
    budget = TokenBudget(model='glm-4.7-flash', response_reserve=4_000)
    relevant_data = _prepare_relevant_data(chapter_num, book_data, budget)

    human_prompt = json.dumps(relevant_data, default=str)
    if budget.truncations:
        logger.info(
            'Chapter %d budget truncations: %s',
            chapter_num,
            ', '.join(budget.truncations),
        )

    fallback = {
        'chapter': chapter_num,
        'title': f'Chapter {chapter_num}',
        'error': 'AI generation temporarily unavailable. Try regenerating later.',
    }
    result = await safe_llm_invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ],
        fallback=fallback,
        log_label=f'Memory book chapter {chapter_num}',
        schema_class=CHAPTER_SCHEMAS.get(chapter_num),
    )
    if isinstance(result, dict):
        return result
    return fallback


def _esc(text: str) -> str:
    """Escape text for safe HTML embedding."""
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _render_chapter_html(section: dict[str, Any]) -> str:
    """Render a single chapter section into formatted HTML.

    Each chapter type has a different JSON structure returned by the LLM.
    We detect the structure and render accordingly.
    """
    title = section.get('title', 'Chapter')
    parts: list[str] = [f'<h2>{_esc(title)}</h2>']

    # Chapter 1 — Cover / Stats: {"title": str, "stats": {key: value}}
    stats = section.get('stats')
    if stats and isinstance(stats, dict):
        stat_items = ''.join(
            f'<div class="stat-card"><span class="stat-value">{_esc(str(v))}</span>'
            f'<span class="stat-label">{_esc(k.replace("_", " ").title())}</span></div>'
            for k, v in stats.items()
        )
        parts.append(f'<div class="stats-grid">{stat_items}</div>')

    # Chapter 2 — Reading Journey: {"entries": [{date, event, milestone}]}
    entries = section.get('entries')
    if entries and isinstance(entries, list):
        entry_parts: list[str] = []
        for e in entries:
            ms = e.get('milestone', '')
            ms_html = f'<div class="timeline-milestone">{_esc(str(ms))}</div>' if ms else ''
            entry_parts.append(
                f'<div class="timeline-entry">'
                f'<div class="timeline-date">{_esc(str(e.get("date", "")))}</div>'
                f'<div class="timeline-event">{_esc(str(e.get("event", "")))}</div>'
                f'{ms_html}</div>'
            )
        parts.append(f'<div class="timeline">{"".join(entry_parts)}</div>')

    # Chapter 3 — Highlights: {"items": [{quote, commentary, location}]}
    items = section.get('items')
    if items and isinstance(items, list):
        highlight_parts: list[str] = []
        for it in items:
            comm = it.get('commentary', '')
            comm_html = f'<p class="highlight-commentary">{_esc(str(comm))}</p>' if comm else ''
            loc = it.get('location', '')
            loc_html = f'<span class="highlight-location">{_esc(str(loc))}</span>' if loc else ''
            highlight_parts.append(
                f'<div class="highlight-item">'
                f'<blockquote class="highlight-quote">{_esc(str(it.get("quote", "")))}</blockquote>'
                f'{comm_html}{loc_html}</div>'
            )
        parts.append(f'<div class="highlights-list">{"".join(highlight_parts)}</div>')

    # Chapter 4 — Notes & Insights: {"themes": [{name, notes: [{content, connection}]}]}
    themes = section.get('themes')
    if themes and isinstance(themes, list):
        theme_parts: list[str] = []
        for th in themes:
            note_parts: list[str] = []
            for n in th.get('notes', []):
                conn = n.get('connection', '')
                conn_html = f'<p class="note-connection">{_esc(str(conn))}</p>' if conn else ''
                note_parts.append(
                    f'<div class="note-entry">'
                    f'<p class="note-content">{_esc(str(n.get("content", "")))}</p>'
                    f'{conn_html}</div>'
                )
            theme_parts.append(
                f'<div class="theme-group">'
                f'<h3 class="theme-name">{_esc(str(th.get("name", "")))}</h3>'
                f'{"".join(note_parts)}</div>'
            )
        parts.append(f'<div class="themes-list">{"".join(theme_parts)}</div>')

    # Chapter 5 — Conversations: {"moments": [{question, answer, topic}]}
    moments = section.get('moments')
    if moments and isinstance(moments, list):
        moment_items = ''.join(
            f'<div class="conversation-moment">'
            f'<div class="moment-topic">{_esc(str(m.get("topic", "")))}</div>'
            f'<div class="moment-q"><strong>Q:</strong> {_esc(str(m.get("question", "")))}</div>'
            f'<div class="moment-a"><strong>A:</strong> {_esc(str(m.get("answer", "")))}</div>'
            f'</div>'
            for m in moments
        )
        parts.append(f'<div class="conversations-list">{moment_items}</div>')

    # Chapter 6 — Looking Forward: {"recommendations": [{type, title, reason}]}
    recommendations = section.get('recommendations')
    if recommendations and isinstance(recommendations, list):
        rec_items = ''.join(
            f'<div class="recommendation">'
            f'<div class="rec-type">{_esc(str(r.get("type", "")))}</div>'
            f'<h4 class="rec-title">{_esc(str(r.get("title", "")))}</h4>'
            f'<p class="rec-reason">{_esc(str(r.get("reason", "")))}</p>'
            f'</div>'
            for r in recommendations
        )
        parts.append(f'<div class="recommendations-list">{rec_items}</div>')

    # Fallback: if no structured fields matched, render any remaining text content
    if len(parts) == 1:
        # Look for any string fields to display as paragraphs
        for key, val in section.items():
            if key in ('title', 'chapter', 'error'):
                continue
            if isinstance(val, str) and val.strip():
                parts.append(f'<p>{_esc(val)}</p>')
            elif isinstance(val, list) and val:
                # Generic list rendering
                for item in val:
                    if isinstance(item, dict):
                        item_text = ' — '.join(
                            _esc(str(v)) for v in item.values() if isinstance(v, (str, int, float))
                        )
                        parts.append(f'<p class="generic-item">{item_text}</p>')
                    elif isinstance(item, str):
                        parts.append(f'<p>{_esc(item)}</p>')

    content = '\n'.join(parts)
    section_id = section.get('id', '')
    id_attr = f' id="{_esc(section_id)}"' if section_id else ''
    return f'<section class="chapter"{id_attr}><div class="chapter-content">{content}</div></section>'


def _render_html(
    book_data: dict[str, Any],
    sections: list[dict[str, Any]],
    stats: dict[str, Any],
) -> str:
    """Render the full memory book as styled HTML."""
    book = book_data.get('book', {})
    book_title = _esc(book.get('title', 'Memory Book'))
    book_author = _esc(book.get('author', ''))

    chapters_html = '\n'.join(_render_chapter_html(s) for s in sections)

    stats_html = ''.join(
        f'<div class="stat-card"><span class="stat-value">{_esc(str(v))}</span>'
        f'<span class="stat-label">{_esc(k.replace("_", " ").title())}</span></div>'
        for k, v in stats.items()
    )

    css = (
        'body{font-family:Georgia,"Times New Roman",serif;max-width:900px;margin:0 auto;padding:2rem;'
        'color:#2d2d2d;background:#fafaf8;line-height:1.7}'
        '.cover{text-align:center;padding:4rem 0;border-bottom:2px solid #e0d8cf;margin-bottom:2rem}'
        '.cover h1{font-size:2.5rem;margin-bottom:.5rem;color:#4a3f35}'
        '.cover h2{color:#6b5e50;font-weight:normal;font-size:1.3rem}'
        '.cover p{color:#8a7e72;font-style:italic}'
        '.stats-grid{display:flex;flex-wrap:wrap;gap:1rem;margin:2rem 0}'
        '.stats-grid .stat-card,.stats .stat-card'
        '{background:#fff;border:1px solid #e0d8cf;border-radius:8px;padding:.75rem 1.25rem;'
        'text-align:center;min-width:120px}'
        '.stat-value{display:block;font-size:1.5rem;font-weight:bold;color:#4a3f35}'
        '.stat-label{display:block;font-size:.75rem;color:#8a7e72;text-transform:uppercase;letter-spacing:.5px}'
        '.chapter{margin:2rem 0;padding:1.5rem 2rem;background:#fff;border-radius:8px;border:1px solid #e0d8cf}'
        '.chapter h2{color:#4a3f35;border-bottom:1px solid #e0d8cf;padding-bottom:.5rem;margin-top:0}'
        '.chapter-content{font-size:.95rem;color:#3d3d3d}'
        '.timeline{position:relative;padding-left:1.5rem;border-left:2px solid #d4c9bc}'
        '.timeline-entry{margin-bottom:1.5rem;position:relative}'
        '.timeline-entry::before{content:"";position:absolute;left:-1.75rem;top:4px;'
        'width:10px;height:10px;border-radius:50%;background:#c4a87c;border:2px solid #fff}'
        '.timeline-date{font-size:.8rem;color:#8a7e72;font-weight:600}'
        '.timeline-event{margin:.2rem 0}'
        '.timeline-milestone{font-size:.85rem;color:#7a6e5f;font-style:italic}'
        '.highlights-list .highlight-item{margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px dashed #e0d8cf}'
        '.highlight-quote{font-style:italic;font-size:1.05rem;color:#4a3f35;margin:.5rem 0;'
        'padding:.5rem 1rem;border-left:3px solid #c4a87c;background:#fdf8f0;border-radius:0 4px 4px 0}'
        '.highlight-commentary{color:#6b5e50;font-size:.9rem;margin:.3rem 0}'
        '.highlight-location{font-size:.75rem;color:#a09080}'
        '.themes-list .theme-group{margin-bottom:1.5rem}'
        '.theme-name{color:#5a4f43;font-size:1.1rem;margin-bottom:.5rem}'
        '.note-entry{padding:.5rem 0 .5rem 1rem;border-left:2px solid #e0d8cf;margin:.3rem 0}'
        '.note-content{margin:0}'
        '.note-connection{color:#7a6e5f;font-size:.85rem;font-style:italic;margin:.2rem 0 0}'
        '.conversations-list .conversation-moment{margin-bottom:1.25rem;padding:1rem;'
        'background:#fdf8f0;border-radius:6px}'
        '.moment-topic{font-size:.8rem;color:#a09080;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.3rem}'
        '.moment-q,.moment-a{margin:.3rem 0}'
        '.recommendations-list .recommendation{margin-bottom:1rem;padding:1rem;'
        'background:#f5f0ea;border-radius:6px}'
        '.rec-type{font-size:.75rem;color:#a09080;text-transform:uppercase;letter-spacing:.5px}'
        '.rec-title{color:#4a3f35;margin:.3rem 0;font-size:1rem}'
        '.rec-reason{color:#6b5e50;font-size:.9rem;margin:0}'
        '.generic-item{padding:.3rem 0;border-bottom:1px dotted #e0d8cf}'
        '@media print{body{background:#fff} .chapter{break-inside:avoid}}'
    )

    # JavaScript for scroll-to-section via postMessage
    scroll_js = (
        'window.addEventListener("message",function(e){'
        'if(e.data&&e.data.type==="scroll-to-section"){'
        'var el=document.getElementById(e.data.sectionId);'
        'if(el)el.scrollIntoView({behavior:"smooth",block:"start"})}});'
    )

    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        + f'<title>{book_title} — Personal Reading Book</title>'
        + f'<style>{css}</style></head><body>'
        + f'<div class="cover"><h1>{book_title}</h1>'
        + f'<h2>by {book_author}</h2>'
        + '<p>A Personal Reading Book</p></div>'
        + f'<div class="stats"><div class="stats-grid">{stats_html}</div></div>'
        + chapters_html
        + f'<script>{scroll_js}</script>'
        + '</body></html>'
    )


async def generate(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    book_format: str = 'personal_book',
) -> MemoryBookResponse:
    """Generate a 6-chapter Personal Reading Book.

    Pipeline: collect data -> generate chapters via LLM -> render HTML -> save.
    """
    book_data = await _collect_book_data(db, user_id, book_id)
    if not book_data.get('book'):
        raise ValueError('Book not found')

    # Chapter type mapping for frontend navigation
    chapter_types = ['cover', 'reading_journey', 'highlights', 'notes', 'conversations', 'looking_forward']

    # Generate all 6 chapters concurrently
    async def _gen(chapter_num: int) -> dict[str, Any]:
        try:
            return await _generate_chapter(chapter_num, book_data, book_format)
        except Exception:
            logger.exception('Failed to generate chapter %d', chapter_num)
            return {'chapter': chapter_num, 'error': 'Generation failed'}

    chapter_results = await asyncio.gather(*[_gen(n) for n in range(1, 7)])

    sections: list[dict[str, Any]] = []
    for idx, chapter in enumerate(chapter_results):
        chapter_num = idx + 1
        section_type = chapter_types[idx] if idx < len(chapter_types) else f'chapter_{chapter_num}'
        chapter['id'] = f'section-{chapter_num}'
        chapter['type'] = section_type
        sections.append(chapter)

    stats = book_data.get('stats', {})

    # Render HTML
    html_content = _render_html(book_data, sections, stats)

    # Save to database (upsert)
    result = await db.execute(
        select(MemoryBook).where(
            MemoryBook.user_id == user_id,
            MemoryBook.book_id == book_id,
        ),
    )
    existing = result.scalar_one_or_none()

    book_title = book_data['book']['title']
    memory_book_title = f'{book_title} — Personal Reading Book'

    if existing:
        existing.sections = sections
        existing.stats = stats
        existing.html_content = html_content
        existing.format = book_format
        existing.title = memory_book_title
        await db.flush()
        memory_book = existing
    else:
        memory_book = MemoryBook(
            user_id=user_id,
            book_id=book_id,
            title=memory_book_title,
            format=book_format,
            sections=sections,
            stats=stats,
            html_content=html_content,
        )
        db.add(memory_book)
        await db.flush()

    return MemoryBookResponse.model_validate(memory_book)
