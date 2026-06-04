"""HTML rendering for Reading Mirror (legacy, kept for mobile compat)."""

from __future__ import annotations

from typing import Any


def _esc(text: str) -> str:
    """Escape text for safe HTML embedding."""
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


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


def _render_attention_map(section: dict[str, Any]) -> list[str]:
    """Render attention map: engagement score, reading style, pattern analysis, and peaks timeline."""
    parts: list[str] = []
    peaks = section.get('peaks')
    if not (peaks and isinstance(peaks, list)):
        return parts

    engagement_score = section.get('engagement_score', '')
    reading_style = section.get('reading_style', '')

    if engagement_score or reading_style:
        metrics_html = '<div class="stats-grid">'
        if engagement_score:
            metrics_html += (
                f'<div class="stat-card"><span class="stat-value">'
                f'{_esc(str(engagement_score))}/10</span>'
                f'<span class="stat-label">Engagement</span></div>'
            )
        if reading_style:
            metrics_html += (
                f'<div class="stat-card"><span class="stat-value">'
                f'{_esc(reading_style)}</span>'
                f'<span class="stat-label">Reading Style</span></div>'
            )
        metrics_html += '</div>'
        parts.append(metrics_html)

    pattern_analysis = section.get('pattern_analysis', '')
    if pattern_analysis:
        parts.append(f'<p class="pattern-analysis">{_esc(pattern_analysis)}</p>')

    peak_items = [
        f'<div class="attention-peak">'
        f'<div class="peak-date">{_esc(str(p.get("date", "")))}</div>'
        f'<div class="peak-desc">{_esc(str(p.get("description", "")))}</div></div>'
        for p in peaks
    ]
    parts.append(f'<div class="peaks-timeline">{"".join(peak_items)}</div>')
    return parts


def _render_retention_section(section: dict[str, Any]) -> list[str]:
    """Render retention analysis: top insight, stuck concepts, and slipping concepts."""
    parts: list[str] = []
    stuck_items = section.get('stuck')
    if not (stuck_items and isinstance(stuck_items, list)):
        return parts

    top_insight = section.get('top_insight', '')
    if top_insight:
        parts.append(
            f'<div class="insight-card"><div class="insight-label">Top Insight</div>'
            f'<p class="insight-text">{_esc(top_insight)}</p></div>'
        )
    retention_summary = section.get('retention_summary', '')
    if retention_summary:
        parts.append(f'<p class="retention-summary">{_esc(retention_summary)}</p>')

    stuck_html = ''.join(
        f'<div class="stuck-item"><strong>{_esc(s.get("concept", ""))}</strong>'
        f'<p class="stuck-evidence">{_esc(s.get("evidence", ""))}</p></div>'
        for s in stuck_items
    )
    parts.append(f'<div class="stuck-section"><h3>What Stuck</h3>{stuck_html}</div>')

    slipping_items = section.get('slipping')
    if slipping_items and isinstance(slipping_items, list):
        slipping_html = ''.join(
            f'<div class="slipping-item"><strong>{_esc(s.get("concept", ""))}</strong>'
            f'<p class="slipping-tip">{_esc(s.get("tip", ""))}</p></div>'
            for s in slipping_items
        )
        parts.append(
            f'<div class="slipping-section"><h3>Still Slipping</h3>{slipping_html}</div>'
        )
    return parts


def _render_concept_web(section: dict[str, Any]) -> list[str]:
    """Render concept web: hub concepts, surprising connections, peripheral concepts, and narrative."""
    parts: list[str] = []
    hub_concepts = section.get('hub_concepts')
    if not (hub_concepts and isinstance(hub_concepts, list)):
        return parts

    hub_html = ''.join(
        f'<div class="hub-concept"><strong>{_esc(h.get("name", ""))}</strong>'
        f'<p class="hub-why">{_esc(h.get("why_central", ""))}</p></div>'
        for h in hub_concepts
    )
    parts.append(f'<div class="concept-hubs"><h3>Central Ideas</h3>{hub_html}</div>')

    surprising = section.get('surprising_connections')
    if surprising and isinstance(surprising, list):
        conn_html = ''.join(
            f'<div class="surprising-connection">'
            f'<span class="conn-from">{_esc(c.get("from", ""))}</span>'
            f' <span class="conn-arrow">&harr;</span> '
            f'<span class="conn-to">{_esc(c.get("to", ""))}</span>'
            f'<p class="conn-insight">{_esc(c.get("insight", ""))}</p></div>'
            for c in surprising
        )
        parts.append(
            f'<div class="surprising-connections"><h3>Surprising Connections</h3>'
            f'{conn_html}</div>'
        )

    peripheral = section.get('peripheral_concepts')
    if peripheral and isinstance(peripheral, list):
        tags = ''.join(
            f'<span class="peripheral-tag">{_esc(str(pc))}</span>' for pc in peripheral
        )
        parts.append(
            f'<div class="peripheral-concepts"><h3>Also Explored</h3>'
            f'<div class="tag-cloud">{tags}</div></div>'
        )

    map_narrative = section.get('map_narrative', '')
    if map_narrative:
        parts.append(f'<p class="map-narrative">{_esc(map_narrative)}</p>')
    return parts


def _render_threads_section(section: dict[str, Any]) -> list[str]:
    """Render cross-book threads with pattern analysis and next-theme suggestion."""
    parts: list[str] = []
    threads = section.get('threads')
    if not (threads and isinstance(threads, list)):
        return parts

    thread_html = ''.join(
        f'<div class="thread-card">'
        f'<div class="thread-theme">{_esc(t.get("theme", ""))}</div>'
        f'<div class="thread-books">'
        + ' &amp; '.join(_esc(str(b)) for b in t.get('books', []))
        + '</div>'
        f'<p class="thread-connection">{_esc(t.get("connection", ""))}</p></div>'
        for t in threads
    )
    parts.append(f'<div class="threads-list">{thread_html}</div>')
    reading_pattern = section.get('reading_pattern', '')
    if reading_pattern:
        parts.append(f'<p class="reading-pattern">{_esc(reading_pattern)}</p>')
    suggested = section.get('suggested_next_theme', '')
    if suggested:
        parts.append(
            f'<div class="callout"><div class="callout-label">Explore Next</div>'
            f'<p class="callout-text">{_esc(suggested)}</p></div>'
        )
    return parts


def _render_essay_and_phases(section: dict[str, Any]) -> list[str]:
    """Render reflective essay, annotation phases/thinking arc."""
    parts: list[str] = []

    essay = section.get('essay')
    if essay and isinstance(essay, str) and essay.strip():
        parts.append(f'<div class="essay-body">{_esc(essay)}</div>')
        key_transformation = section.get('key_transformation', '')
        if key_transformation:
            parts.append(
                f'<div class="transformation-card">'
                f'<div class="transformation-label">Key Transformation</div>'
                f'<p class="transformation-text">{_esc(key_transformation)}</p></div>'
            )
        parting_question = section.get('parting_question', '')
        if parting_question:
            parts.append(
                f'<div class="parting-question">'
                f'<blockquote>{_esc(parting_question)}</blockquote></div>'
            )

    phases = section.get('phases')
    if phases and isinstance(phases, list):
        phase_html: list[str] = []
        for idx, ph in enumerate(phases):
            notes_html = ''.join(
                f'<li>{_esc(str(n))}</li>' for n in ph.get('key_notes', [])
            )
            notes_list = f'<ul class="phase-notes">{notes_html}</ul>' if notes_html else ''
            phase_html.append(
                f'<div class="annotation-phase">'
                f'<div class="phase-number">Phase {idx + 1}</div>'
                f'<h3>{_esc(ph.get("name", ""))}</h3>'
                f'<p class="phase-narrative">{_esc(ph.get("narrative", ""))}</p>'
                f'{notes_list}</div>'
            )
        parts.append(f'<div class="phases-timeline">{"".join(phase_html)}</div>')
        arc_summary = section.get('arc_summary', '')
        if arc_summary:
            parts.append(f'<p class="arc-summary">{_esc(arc_summary)}</p>')
    return parts


def _render_breakthroughs(section: dict[str, Any]) -> list[str]:
    """Render conversation breakthroughs and summary."""
    parts: list[str] = []
    breakthroughs = section.get('breakthroughs')
    if not (breakthroughs and isinstance(breakthroughs, list)):
        return parts

    bt_html = ''.join(
        f'<div class="breakthrough-card">'
        f'<h3>{_esc(b.get("title", ""))}</h3>'
        f'<p class="breakthrough-narrative">{_esc(b.get("narrative", ""))}</p>'
        f'<div class="breakthrough-question">'
        f'<span class="question-label">You asked:</span> '
        f'{_esc(b.get("reader_question", ""))}</div>'
        f'<p class="breakthrough-insight">{_esc(b.get("insight", ""))}</p></div>'
        for b in breakthroughs
    )
    parts.append(f'<div class="breakthroughs">{bt_html}</div>')
    conv_summary = section.get('summary', '')
    if conv_summary:
        parts.append(f'<p class="conversation-summary">{_esc(conv_summary)}</p>')
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
        # --- v2 section styles ---
        '.pattern-analysis{color:#3d3d3d;margin:1rem 0;line-height:1.6}'
        '.peaks-timeline{margin:1rem 0}'
        '.attention-peak{display:flex;gap:1rem;padding:.75rem 0;border-bottom:1px solid #f0ece6}'
        '.peak-date{color:#8a7e72;font-size:.85rem;min-width:80px}'
        '.peak-desc{color:#3d3d3d;flex:1}'
        '.insight-card{background:#fdf8f0;border-left:4px solid #d97706;border-radius:0 8px 8px 0;'
        'padding:1rem 1.25rem;margin:1.5rem 0}'
        '.insight-label{font-size:.75rem;color:#92400e;text-transform:uppercase;'
        'letter-spacing:.5px;margin-bottom:.3rem}'
        '.insight-text{font-size:1.05rem;color:#4a3f35;margin:0;font-style:italic}'
        '.retention-summary{color:#6b5e50;margin:1rem 0}'
        '.stuck-section,.slipping-section{margin:1rem 0}'
        '.stuck-item,.slipping-item{padding:.75rem;margin:.5rem 0;border-radius:6px}'
        '.stuck-item{background:#f0fdf4;border-left:3px solid #65a30d}'
        '.slipping-item{background:#fffbeb;border-left:3px solid #d97706}'
        '.stuck-evidence,.slipping-tip{color:#6b5e50;font-size:.9rem;margin:.2rem 0}'
        '.concept-hubs,.surprising-connections,.peripheral-concepts{margin:1rem 0}'
        '.hub-concept{background:#fdf8f0;padding:.75rem 1rem;border-radius:6px;margin:.5rem 0}'
        '.hub-why{color:#6b5e50;font-size:.9rem;margin:.2rem 0}'
        '.surprising-connection{padding:.75rem;margin:.5rem 0;background:#f5f0ea;border-radius:6px}'
        '.conn-from,.conn-to{font-weight:bold;color:#4a3f35}'
        '.conn-arrow{color:#d97706;margin:0 .5rem}'
        '.conn-insight{color:#6b5e50;font-size:.9rem;margin:.3rem 0 0}'
        '.tag-cloud{display:flex;flex-wrap:wrap;gap:.5rem}'
        '.peripheral-tag{display:inline-block;padding:.3rem .7rem;background:#f5f0ea;border-radius:1rem;'
        'font-size:.85rem;color:#6b5e50}'
        '.map-narrative{color:#3d3d3d;margin:1rem 0;line-height:1.6}'
        '.threads-list{margin:1rem 0}'
        '.thread-card{background:#f5f0ea;padding:1rem;border-radius:6px;margin:.75rem 0}'
        '.thread-theme{font-weight:bold;color:#4a3f35;margin-bottom:.3rem}'
        '.thread-books{color:#8a7e72;font-size:.85rem;margin-bottom:.3rem}'
        '.thread-connection{color:#3d3d3d;margin:0}'
        '.reading-pattern{color:#6b5e50;margin:1rem 0}'
        '.callout{background:#fef3c7;border-radius:8px;padding:1rem 1.25rem;margin:1.5rem 0;'
        'text-align:center}'
        '.callout-label{font-size:.75rem;color:#92400e;text-transform:uppercase;'
        'letter-spacing:.5px;margin-bottom:.3rem}'
        '.callout-text{color:#4a3f35;font-size:1rem;margin:0;font-weight:bold}'
        '.essay-body{font-size:1.05rem;line-height:1.8;color:#3d3d3d;margin:1rem 0}'
        '.transformation-card{background:#f0fdf4;border-left:4px solid #65a30d;border-radius:0 8px 8px 0;'
        'padding:1rem 1.25rem;margin:1.5rem 0}'
        '.transformation-label{font-size:.75rem;color:#166534;text-transform:uppercase;'
        'letter-spacing:.5px;margin-bottom:.3rem}'
        '.transformation-text{color:#3d3d3d;font-size:1rem;margin:0}'
        '.parting-question{margin:1.5rem 0}'
        '.phases-timeline{margin:1rem 0}'
        '.annotation-phase{padding:1rem;margin:.75rem 0;background:#fdf8f0;border-radius:6px;'
        'border-left:3px solid #d97706}'
        '.phase-number{font-size:.75rem;color:#8a7e72;text-transform:uppercase;letter-spacing:.5px}'
        '.phase-narrative{color:#3d3d3d;margin:.3rem 0}'
        '.phase-notes{color:#6b5e50;font-size:.9rem;margin:.3rem 0 0;padding-left:1.2rem}'
        '.phase-notes li{margin:.2rem 0}'
        '.arc-summary{color:#6b5e50;font-style:italic;margin:1rem 0}'
        '.breakthroughs{margin:1rem 0}'
        '.breakthrough-card{background:#fdf8f0;padding:1rem;border-radius:6px;margin:.75rem 0;'
        'border-left:3px solid #d97706}'
        '.breakthrough-card h3{color:#4a3f35;margin:0 0 .3rem;font-size:1rem}'
        '.breakthrough-narrative{color:#3d3d3d;margin:.3rem 0}'
        '.breakthrough-question{color:#8a7e72;font-size:.9rem;margin:.3rem 0}'
        '.question-label{font-weight:bold;color:#6b5e50}'
        '.breakthrough-insight{color:#3d3d3d;font-size:.9rem;font-style:italic;margin:.3rem 0 0}'
        '.conversation-summary{color:#6b5e50;font-style:italic;margin:1rem 0}'
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
