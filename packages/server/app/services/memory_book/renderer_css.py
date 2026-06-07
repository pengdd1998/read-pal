"""CSS styles for the Reading Mirror HTML renderer."""

from __future__ import annotations


def _css_base() -> str:
    """Base body typography and print media query."""
    return (
        'body{font-family:Georgia,"Times New Roman",serif;max-width:900px;margin:0 auto;padding:2rem;'
        'color:#2d2d2d;background:#fafaf8;line-height:1.7}'
    )


def _css_cover() -> str:
    """Cover page styles."""
    return (
        '.cover{text-align:center;padding:4rem 0;border-bottom:2px solid #e0d8cf;margin-bottom:2rem}'
        '.cover h1{font-size:2.5rem;margin-bottom:.5rem;color:#4a3f35}'
        '.cover h2{color:#6b5e50;font-weight:normal;font-size:1.3rem}'
        '.cover p{color:#8a7e72;font-style:italic}'
    )


def _css_stats() -> str:
    """Stats grid and stat card styles."""
    return (
        '.stats-grid{display:flex;flex-wrap:wrap;gap:1rem;margin:2rem 0}'
        '.stats-grid .stat-card,.stats .stat-card'
        '{background:#fff;border:1px solid #e0d8cf;border-radius:8px;padding:.75rem 1.25rem;'
        'text-align:center;min-width:120px}'
        '.stat-value{display:block;font-size:1.5rem;font-weight:bold;color:#4a3f35}'
        '.stat-label{display:block;font-size:.75rem;color:#8a7e72;text-transform:uppercase;letter-spacing:.5px}'
    )


def _css_chapter() -> str:
    """Chapter container and content styles."""
    return (
        '.chapter{margin:2rem 0;padding:1.5rem 2rem;background:#fff;border-radius:8px;border:1px solid #e0d8cf}'
        '.chapter h2{color:#4a3f35;border-bottom:1px solid #e0d8cf;padding-bottom:.5rem;margin-top:0}'
        '.chapter-content{font-size:.95rem;color:#3d3d3d}'
    )


def _css_annotations() -> str:
    """Highlights, quotes, commentary, conversations, recommendations, and placeholders."""
    return (
        '.encounter-text{font-size:1.1rem;line-height:1.8;font-style:italic;color:#3d3d3d;margin:1rem 0}'
        '.archetype-badge{display:inline-block;padding:.3rem .8rem;background:#fef3c7;border-radius:1rem;'
        'font-size:.85rem;color:#92400e;margin:.5rem 0}'
        'blockquote{font-style:italic;font-size:1.05rem;color:#4a3f35;margin:.5rem 0;'
        'padding:.5rem 1rem;border-left:3px solid #d97706;background:#fdf8f0;border-radius:0 4px 4px 0}'
        '.highlight-commentary{color:#6b5e50;font-size:.9rem;margin:.3rem 0}'
        '.conversation-moment{margin-bottom:1.25rem;padding:1rem;background:#fdf8f0;border-radius:6px}'
        '.moment-topic{font-size:.8rem;color:#a09080;text-transform:uppercase;letter-spacing:.5px;'
        'margin-bottom:.3rem}'
        '.recommendation{margin-bottom:1rem;padding:1rem;background:#f5f0ea;border-radius:6px}'
        '.placeholder-text{color:#a09080;font-style:italic;text-align:center;padding:2rem}'
    )


def _css_attention() -> str:
    """Attention peaks, insights, retention, stuck/slipping sections."""
    return (
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
    )


def _css_knowledge_graph() -> str:
    """Concept hubs, connections, tags, narrative map, and thread styles."""
    return (
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
    )


def _css_reading_journey() -> str:
    """Phases timeline, breakthrough cards, and conversation summary."""
    return (
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
    )


def _css_special_sections() -> str:
    """Callouts, essay body, transformation cards, and parting question."""
    return (
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
    )


def _build_stylesheet() -> str:
    """Return the minified CSS for the reading mirror HTML."""
    return ''.join([
        _css_base(),
        _css_cover(),
        _css_stats(),
        _css_chapter(),
        _css_annotations(),
        _css_attention(),
        _css_knowledge_graph(),
        _css_reading_journey(),
        _css_special_sections(),
        '@media print{body{background:#fff} .chapter{break-inside:avoid}}',
    ])
