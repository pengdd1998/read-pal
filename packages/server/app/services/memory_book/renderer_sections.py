"""Section-level HTML rendering for Reading Mirror (legacy)."""

from __future__ import annotations

from typing import Any

from app.services.memory_book.renderer_specialized import (
    _render_attention_map,
    _render_breakthroughs,
    _render_concept_web,
    _render_essay_and_phases,
    _render_retention_section,
    _render_threads_section,
)
from app.services.memory_book.renderer_utils import _esc


def _render_legacy_sections(section: dict[str, Any]) -> list[str]:
    """Render legacy v1 section types: encounter, clusters, recs, stats, timeline, highlights, themes, moments."""
    parts: list[str] = []

    prologue = section.get('prologue')
    if prologue and isinstance(prologue, dict):
        parts.append(f'<div class="encounter-text">{_esc(prologue.get("text", ""))}</div>')
        archetype = prologue.get('reading_archetype', '')
        if archetype:
            parts.append(f'<div class="archetype-badge">{_esc(archetype)}</div>')

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

    recs = section.get('recommendations')
    if recs and isinstance(recs, list):
        for r in recs:
            parts.append(
                f'<div class="recommendation"><strong>{_esc(r.get("title", ""))}</strong> '
                f'by {_esc(r.get("author", ""))}<br>'
                f'{_esc(r.get("reason", ""))}</div>'
            )

    stats = section.get('stats')
    if stats and isinstance(stats, dict):
        stat_items = ''.join(
            f'<div class="stat-card"><span class="stat-value">{_esc(str(v))}</span>'
            f'<span class="stat-label">{_esc(k.replace("_", " ").title())}</span></div>'
            for k, v in stats.items()
        )
        parts.append(f'<div class="stats-grid">{stat_items}</div>')

    return parts


def _render_timeline_and_highlights(section: dict[str, Any]) -> list[str]:
    """Render timeline entries, legacy highlight items, themes, and conversation moments."""
    parts: list[str] = []

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

    items = section.get('items') or section.get('highlights')
    if items and isinstance(items, list) and all(isinstance(i, dict) and ('passage' in i or 'quote' in i) for i in items):
        for it in items:
            quote = it.get('passage') or it.get('quote', '')
            comm = it.get('context') or it.get('why_it_mattered') or it.get('commentary', '')
            parts.append(f'<blockquote>{_esc(str(quote))}</blockquote>')
            if comm:
                parts.append(f'<p class="highlight-commentary">{_esc(str(comm))}</p>')

    themes = section.get('themes')
    if themes and isinstance(themes, list) and themes and isinstance(themes[0], dict):
        for th in themes:
            parts.append(f'<h3>{_esc(str(th.get("name") or th.get("theme", "")))}</h3>')
            for n in th.get('notes', th.get('insights', [])):
                text = n if isinstance(n, str) else n.get('content', n.get('insight', ''))
                parts.append(f'<p>{_esc(str(text))}</p>')

    moments = section.get('moments')
    if moments and isinstance(moments, list):
        for m in moments:
            parts.append(
                f'<div class="conversation-moment">'
                f'<div class="moment-topic">{_esc(str(m.get("topic", "")))}</div>'
                f'<p>{_esc(str(m.get("insight") or m.get("exchange", "")))}</p></div>'
            )

    return parts


def _render_chapter_html(section: dict[str, Any]) -> str:
    """Render a single section into formatted HTML (legacy renderer)."""
    title = section.get('title', section.get('type', 'Section'))
    parts: list[str] = [f'<h2>{_esc(title)}</h2>']

    parts.extend(_render_legacy_sections(section))
    parts.extend(_render_timeline_and_highlights(section))
    parts.extend(_render_attention_map(section))
    parts.extend(_render_retention_section(section))
    parts.extend(_render_concept_web(section))
    parts.extend(_render_threads_section(section))
    parts.extend(_render_essay_and_phases(section))
    parts.extend(_render_breakthroughs(section))

    if section.get('placeholder'):
        parts.append(
            f'<p class="placeholder-text">{_esc(section.get("message", "Coming soon."))}</p>'
        )

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
