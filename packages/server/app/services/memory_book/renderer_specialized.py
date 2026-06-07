"""Specialized section renderers for Reading Mirror (attention, retention, concept web, threads, essay, breakthroughs)."""

from __future__ import annotations

from typing import Any

from app.services.memory_book.renderer_utils import _esc


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
