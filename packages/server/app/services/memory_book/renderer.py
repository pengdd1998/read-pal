"""HTML rendering for Reading Mirror (legacy, kept for mobile compat)."""

from __future__ import annotations

from typing import Any

from app.services.memory_book.renderer_css import _build_stylesheet
from app.services.memory_book.renderer_sections import _render_chapter_html
from app.services.memory_book.renderer_utils import _esc
from app.utils.i18n import DEFAULT_LANGUAGE


def _assemble_document(
    book_title: str,
    book_author: str,
    stats_html: str,
    chapters_html: str,
    lang: str = DEFAULT_LANGUAGE,
) -> str:
    """Assemble the full HTML document from pre-rendered parts."""
    css = _build_stylesheet()
    scroll_js = (
        'window.addEventListener("message",function(e){'
        'if(e.data&&e.data.type==="scroll-to-section"){'
        'var el=document.getElementById(e.data.sectionId);'
        'if(el)el.scrollIntoView({behavior:"smooth",block:"start"})}});'
    )
    return (
        f'<!DOCTYPE html><html lang="{lang}"><head><meta charset="utf-8">'
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

    return _assemble_document(book_title, book_author, stats_html, chapters_html)
