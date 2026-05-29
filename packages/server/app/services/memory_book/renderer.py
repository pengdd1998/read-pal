"""HTML rendering for Reading Mirror (legacy, kept for mobile compat)."""

from __future__ import annotations

from typing import Any


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
