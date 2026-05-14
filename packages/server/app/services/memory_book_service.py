"""Reading Mirror service -- 10-section personalized reading reflection.

Pipeline: collect enriched data -> generate sections via LLM -> store as JSON.
HTML rendering is kept for backward compat (mobile iframe) but deprecated.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
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
from app.prompts import MIRROR_SECTIONS, MIRROR_SYSTEM
from app.schemas.llm_outputs import (
    EncounterData,
    GroundedRecommendationData,
    HighlightClusterData,
)
from app.schemas.memory_book import MemoryBookResponse
from app.services.llm import safe_llm_invoke
from app.utils.annotations import match_annotation_type
from app.utils.sanitizer import sanitize_user_input
from app.utils.token_budget import TokenBudget

logger = logging.getLogger('read-pal.memory_book')

# Section type constants
SECTION_TYPES = [
    'encounter',          # 1: Second-person prologue
    'attention_map',      # 2: Engagement heatmap (Phase 2)
    'highlights',         # 3: Themed highlight clusters
    'annotations_woven',  # 4: Thinking arc (Phase 2)
    'conversations',      # 5: Breakthrough moments (Phase 2)
    'concept_web',        # 6: Knowledge graph (Phase 2)
    'what_stuck',         # 7: Flashcard retention (Phase 2)
    'threads',            # 8: Cross-book connections (Phase 2)
    'reader_became',      # 9: Reflective essay (Phase 2)
    'recommendations',    # 10: Grounded recommendations
]

# Maps section type -> Pydantic schema for LLM validation
SECTION_SCHEMAS: dict[str, type] = {
    'encounter': EncounterData,
    'highlights': HighlightClusterData,
    'recommendations': GroundedRecommendationData,
}


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------

async def _collect_book_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect raw reading data (unchanged from v1)."""
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
    result = await db.execute(
        select(Annotation)
        .where(Annotation.user_id == user_id, Annotation.book_id == book_id)
        .order_by(Annotation.created_at)
        .limit(500),
    )
    annotations = list(result.scalars().all())
    data['highlights'] = [
        {
            'id': str(a.id),
            'content': sanitize_user_input(a.content, context='highlight_content'),
            'note': sanitize_user_input(a.note or '', context='highlight_note'),
            'tags': a.tags, 'location': a.location,
            'created_at': a.created_at.isoformat() if a.created_at else None,
        }
        for a in annotations if match_annotation_type(a.type, AnnotationType.highlight)
    ]
    data['notes'] = [
        {
            'id': str(a.id),
            'content': sanitize_user_input(a.content, context='note_content'),
            'note': sanitize_user_input(a.note or '', context='note_text'),
            'tags': a.tags,
            'created_at': a.created_at.isoformat() if a.created_at else None,
        }
        for a in annotations if match_annotation_type(a.type, AnnotationType.note)
    ]
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


async def _collect_enriched_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect raw data + enrich with knowledge graph, mastery, and synthesis."""
    data = await _collect_book_data(db, user_id, book_id)
    if not data.get('book'):
        return data

    enriched: dict[str, Any] = {**data}

    # Knowledge graph concepts
    try:
        from app.services.knowledge_service import get_concepts
        concepts = await get_concepts(db, user_id, book_id)
        enriched['concepts'] = [c.get('label', c.get('name', '')) for c in concepts if c.get('label') or c.get('name')]
    except Exception:
        logger.info('Knowledge graph enrichment skipped for book %s', book_id)
        enriched['concepts'] = []

    # Study mode mastery
    try:
        from app.services.study_mode_service import get_mastery
        mastery = await get_mastery(db, user_id, book_id)
        enriched['mastery'] = mastery
    except Exception:
        logger.info('Mastery enrichment skipped for book %s', book_id)
        enriched['mastery'] = {}

    # Synthesis themes
    try:
        from app.services.synthesis_service import synthesize
        synthesis = await synthesize(db, user_id, book_id)
        themes = []
        syn_data = getattr(synthesis, 'data', None) or (synthesis if isinstance(synthesis, dict) else None)
        if isinstance(syn_data, dict):
            theme_list = syn_data.get('themes', [])
            themes = [t.get('name', '') for t in theme_list if isinstance(t, dict) and t.get('name')]
        enriched['synthesis_themes'] = themes
    except Exception:
        logger.info('Synthesis enrichment skipped for book %s', book_id)
        enriched['synthesis_themes'] = []

    # Compute reading pace and session details for Encounter section
    sessions = data.get('reading_sessions', [])
    if sessions:
        total_minutes = sum(s.get('duration', 0) for s in sessions) / 60
        total_pages = sum(s.get('pages_read', 0) for s in sessions)
        enriched['reading_pace'] = round(total_pages / max(total_minutes / 60, 0.1), 1)
        enriched['longest_session_minutes'] = max(s.get('duration', 0) for s in sessions) / 60
        enriched['first_session_date'] = sessions[0].get('started_at')
        enriched['last_session_date'] = sessions[-1].get('started_at')
    else:
        enriched['reading_pace'] = 0
        enriched['longest_session_minutes'] = 0
        enriched['first_session_date'] = None
        enriched['last_session_date'] = None

    # First highlight text (for Encounter prompt)
    highlights = data.get('highlights', [])
    enriched['first_highlight'] = highlights[0].get('content', '')[:200] if highlights else ''

    # User's other completed books (for recommendations)
    try:
        result = await db.execute(
            select(Book.title)
            .where(Book.user_id == user_id, Book.id != book_id, Book.status == 'completed')
            .limit(20),
        )
        enriched['existing_books'] = [r[0] for r in result.all()]
    except Exception:
        enriched['existing_books'] = []

    return enriched


# ---------------------------------------------------------------------------
# Section generation
# ---------------------------------------------------------------------------

def _prepare_section_data(
    section_type: str,
    enriched_data: dict[str, Any],
    budget: TokenBudget,
) -> dict[str, Any]:
    """Prepare the data payload for a specific section type."""
    if section_type == 'encounter':
        sessions = enriched_data.get('reading_sessions', [])
        total_min = enriched_data.get('stats', {}).get('total_reading_minutes', 0)
        hours = total_min // 60
        mins = total_min % 60
        longest = enriched_data.get('longest_session_minutes', 0)
        lh = int(longest) // 60
        lm = int(longest) % 60
        return {
            'total_time': f'{hours}h {mins}m' if hours > 0 else f'{mins}m',
            'session_count': len(sessions),
            'first_date': enriched_data.get('first_session_date', 'unknown'),
            'last_date': enriched_data.get('last_session_date', 'unknown'),
            'first_highlight': enriched_data.get('first_highlight', ''),
            'concept_list': ', '.join(enriched_data.get('concepts', [])[:10]),
            'mastery_score': enriched_data.get('mastery', {}).get('overallMastery', 0),
            'highlight_count': enriched_data.get('stats', {}).get('total_highlights', 0),
            'longest_session': f'{lh}h {lm}m' if lh > 0 else f'{lm}m',
        }

    elif section_type == 'highlights':
        raw_highlights = enriched_data.get('highlights', [])[:30]
        budgeted = _budget_list(raw_highlights, budget, 'highlights')
        return {
            'count': len(enriched_data.get('highlights', [])),
            'book_title': enriched_data.get('book', {}).get('title', ''),
            'concept_list': ', '.join(enriched_data.get('concepts', [])[:10]),
            'theme_list': ', '.join(enriched_data.get('synthesis_themes', [])[:5]),
            'highlights': budgeted,
        }

    elif section_type == 'recommendations':
        return {
            'book_title': enriched_data.get('book', {}).get('title', ''),
            'top_themes': ', '.join(enriched_data.get('synthesis_themes', [])[:5]),
            'concept_list': ', '.join(enriched_data.get('concepts', [])[:10]),
            'existing_books': ', '.join(enriched_data.get('existing_books', [])[:15]),
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


async def _generate_section(
    section_type: str,
    enriched_data: dict[str, Any],
) -> dict[str, Any]:
    """Generate a single Reading Mirror section via LLM."""
    section_template = MIRROR_SECTIONS.get(section_type)
    if section_template is None:
        return _placeholder_section(section_type)

    book_title = enriched_data.get('book', {}).get('title', 'Unknown')
    book_author = enriched_data.get('book', {}).get('author', 'Unknown')

    budget = TokenBudget(model='glm-4.7-flash', response_reserve=4_000)
    section_data = _prepare_section_data(section_type, enriched_data, budget)

    system_prompt = MIRROR_SYSTEM.template.format(
        book_title=book_title,
        book_author=book_author,
        section_prompt=section_template.template,
    )

    human_prompt = json.dumps(section_data, default=str)
    if budget.truncations:
        logger.info('Section %s budget truncations: %s', section_type, ', '.join(budget.truncations))

    fallback = {
        'type': section_type,
        'error': 'AI generation temporarily unavailable. Try regenerating later.',
    }
    result = await safe_llm_invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ],
        fallback=fallback,
        log_label=f'Reading Mirror section {section_type}',
        schema_class=SECTION_SCHEMAS.get(section_type),
    )
    if isinstance(result, dict):
        return result
    return fallback


def _placeholder_section(section_type: str) -> dict[str, Any]:
    """Return a placeholder section for Phase 2 sections."""
    section_names = {
        'attention_map': 'Map of Your Attention',
        'annotations_woven': 'Your Annotations, Woven',
        'conversations': 'Conversations That Shifted Your Thinking',
        'concept_web': 'Your Concept Web',
        'what_stuck': 'What Stuck',
        'threads': 'Threads Between Books',
        'reader_became': 'The Reader You Became',
    }
    return {
        'type': section_type,
        'title': section_names.get(section_type, section_type),
        'placeholder': True,
        'message': 'This section will be available in a future update.',
    }


# ---------------------------------------------------------------------------
# HTML rendering (legacy, kept for mobile compat)
# ---------------------------------------------------------------------------

def _esc(text: str) -> str:
    """Escape text for safe HTML embedding."""
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _render_chapter_html(section: dict[str, Any]) -> str:
    """Render a single section into formatted HTML (legacy renderer)."""
    title = section.get('title', section.get('type', 'Section'))
    parts: list[str] = [f'<h2>{_esc(title)}</h2>']

    # Encounter data
    prologue = section.get('prologue')
    if prologue and isinstance(prologue, dict):
        parts.append(f'<div class="encounter-text">{_esc(prologue.get("text", ""))}</div>')
        archetype = prologue.get('reading_archetype', '')
        if archetype:
            parts.append(f'<div class="archetype-badge">{_esc(archetype)}</div>')

    # Highlight cluster data
    clusters = section.get('clusters')
    if clusters and isinstance(clusters, list):
        for cl in clusters:
            parts.append(f'<h3>{_esc(cl.get("name", ""))}</h3>')
            parts.append(f'<p>{_esc(cl.get("description", ""))}</p>')
            for h in cl.get('highlights', []):
                parts.append(
                    f'<blockquote>{_esc(h.get("quote", ""))}</blockquote>'
                    f'<p class="highlight-commentary">{_esc(h.get("why_it_mattered", ""))}</p>'
                )

    # Recommendation data
    recs = section.get('recommendations')
    if recs and isinstance(recs, list):
        for r in recs:
            parts.append(
                f'<div class="recommendation"><strong>{_esc(r.get("title", ""))}</strong> '
                f'by {_esc(r.get("author", ""))}<br>'
                f'{_esc(r.get("reason", ""))}</div>'
            )

    # Stats
    stats = section.get('stats')
    if stats and isinstance(stats, dict):
        stat_items = ''.join(
            f'<div class="stat-card"><span class="stat-value">{_esc(str(v))}</span>'
            f'<span class="stat-label">{_esc(k.replace("_", " ").title())}</span></div>'
            for k, v in stats.items()
        )
        parts.append(f'<div class="stats-grid">{stat_items}</div>')

    # Timeline entries (legacy)
    entries = section.get('entries') or section.get('timeline')
    if entries and isinstance(entries, list):
        entry_parts: list[str] = []
        for e in entries:
            entry_parts.append(
                f'<div class="timeline-entry">'
                f'<div class="timeline-date">{_esc(str(e.get("date", "")))}</div>'
                f'<div class="timeline-event">{_esc(str(e.get("event", "")))}</div></div>'
            )
        parts.append(f'<div class="timeline">{"".join(entry_parts)}</div>')

    # Legacy highlight items
    items = section.get('items') or section.get('highlights')
    if items and isinstance(items, list) and all(isinstance(i, dict) and ('passage' in i or 'quote' in i) for i in items):
        for it in items:
            quote = it.get('passage') or it.get('quote', '')
            comm = it.get('context') or it.get('why_it_mattered') or it.get('commentary', '')
            parts.append(f'<blockquote>{_esc(str(quote))}</blockquote>')
            if comm:
                parts.append(f'<p class="highlight-commentary">{_esc(str(comm))}</p>')

    # Legacy themes
    themes = section.get('themes')
    if themes and isinstance(themes, list) and themes and isinstance(themes[0], dict):
        for th in themes:
            parts.append(f'<h3>{_esc(str(th.get("name") or th.get("theme", "")))}</h3>')
            for n in th.get('notes', th.get('insights', [])):
                text = n if isinstance(n, str) else n.get('content', n.get('insight', ''))
                parts.append(f'<p>{_esc(str(text))}</p>')

    # Conversation moments
    moments = section.get('moments')
    if moments and isinstance(moments, list):
        for m in moments:
            parts.append(
                f'<div class="conversation-moment">'
                f'<div class="moment-topic">{_esc(str(m.get("topic", "")))}</div>'
                f'<p>{_esc(str(m.get("insight") or m.get("exchange", "")))}</p></div>'
            )

    # Placeholder sections
    if section.get('placeholder'):
        parts.append(f'<p class="placeholder-text">{_esc(section.get("message", "Coming soon."))}</p>')

    # Fallback: render any remaining text content
    if len(parts) == 1:
        for key, val in section.items():
            if key in ('title', 'chapter', 'error', 'type', 'id', 'generated_at', 'placeholder', 'message'):
                continue
            if isinstance(val, str) and val.strip():
                parts.append(f'<p>{_esc(val)}</p>')

    content = '\n'.join(parts)
    section_id = section.get('id', '')
    id_attr = f' id="{_esc(section_id)}"' if section_id else ''
    return f'<section class="chapter"{id_attr}><div class="chapter-content">{content}</div></section>'


def _render_html(
    book_data: dict[str, Any],
    sections: list[dict[str, Any]],
    stats: dict[str, Any],
) -> str:
    """Render the full reading mirror as styled HTML (legacy)."""
    book = book_data.get('book', {})
    book_title = _esc(book.get('title', 'Reading Mirror'))
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
        '.encounter-text{font-size:1.1rem;line-height:1.8;font-style:italic;color:#3d3d3d;margin:1rem 0}'
        '.archetype-badge{display:inline-block;padding:.3rem .8rem;background:#fef3c7;border-radius:1rem;'
        'font-size:.85rem;color:#92400e;margin:.5rem 0}'
        'blockquote{font-style:italic;font-size:1.05rem;color:#4a3f35;margin:.5rem 0;'
        'padding:.5rem 1rem;border-left:3px solid #d97706;background:#fdf8f0;border-radius:0 4px 4px 0}'
        '.highlight-commentary{color:#6b5e50;font-size:.9rem;margin:.3rem 0}'
        '.conversation-moment{margin-bottom:1.25rem;padding:1rem;background:#fdf8f0;border-radius:6px}'
        '.moment-topic{font-size:.8rem;color:#a09080;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.3rem}'
        '.recommendation{margin-bottom:1rem;padding:1rem;background:#f5f0ea;border-radius:6px}'
        '.placeholder-text{color:#a09080;font-style:italic;text-align:center;padding:2rem}'
        '@media print{body{background:#fff} .chapter{break-inside:avoid}}'
    )

    scroll_js = (
        'window.addEventListener("message",function(e){'
        'if(e.data&&e.data.type==="scroll-to-section"){'
        'var el=document.getElementById(e.data.sectionId);'
        'if(el)el.scrollIntoView({behavior:"smooth",block:"start"})}});'
    )

    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        + f'<title>{book_title} — Reading Mirror</title>'
        + f'<style>{css}</style></head><body>'
        + f'<div class="cover"><h1>{book_title}</h1>'
        + f'<h2>by {book_author}</h2>'
        + '<p>Your Reading Mirror</p></div>'
        + f'<div class="stats"><div class="stats-grid">{stats_html}</div></div>'
        + chapters_html
        + f'<script>{scroll_js}</script>'
        + '</body></html>'
    )


# ---------------------------------------------------------------------------
# Main generation pipeline
# ---------------------------------------------------------------------------

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
    enriched_data = await _collect_enriched_data(db, user_id, book_id)
    if not enriched_data.get('book'):
        raise ValueError('Book not found')

    # Sections that use LLM in Phase 1
    llm_sections = {'encounter', 'highlights', 'recommendations'}

    async def _gen_section(section_type: str) -> dict[str, Any]:
        try:
            if section_type in llm_sections:
                return await _generate_section(section_type, enriched_data)
            else:
                return _placeholder_section(section_type)
        except Exception:
            logger.exception('Failed to generate section %s', section_type)
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

    return MemoryBookResponse.model_validate(memory_book)
