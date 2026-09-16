"""Shared HTML hygiene for EPUB parse paths (M3.4 step ①/②).

``_strip_duplicate_heading`` and ``_strip_dangerous_html`` used to live as
a definition in ``ebooklib_path`` (consumed cross-module by the zipfile
path) plus a byte-identical parity copy in ``zipfile_path`` — a retirement
hazard and a drift hazard. Single implementation here.
"""

from __future__ import annotations

import re


_DANGEROUS_TAG_RE = re.compile(
    r'<\s*/?\s*(script|iframe|object|embed|applet|form|input|button|textarea|select|option|meta|link|base|svg|math|noscript|template)\b[^>]*>',
    re.IGNORECASE,
)
_EVENT_HANDLER_RE = re.compile(
    r'\bon\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)',
    re.IGNORECASE,
)
_SCRIPT_URL_RE = re.compile(
    r'(href|src|xlink:href)\s*=\s*["\']?\s*(?:javascript|vbscript|livescript|mocha):[^"\'>\s]*',
    re.IGNORECASE,
)
_DATA_URL_RE = re.compile(
    r'(href|src|xlink:href)\s*=\s*["\']?\s*data:(?!image/)[^"\'>\s]*',
    re.IGNORECASE,
)


def _strip_duplicate_heading(
    title: str, text: str, enriched_html: str,
) -> tuple[str, str]:
    """Remove a leading heading line that duplicates the chapter title.

    The reader's ChapterHeader renders the title; when the document's own
    first heading is the same text (the near-universal pattern), the body
    used to start with a repeated "序\n\n..." / "1\n\n..." line.
    """
    if not title:
        return text, enriched_html
    stripped = text.lstrip()
    title_norm = title.strip()
    if not stripped.startswith(title_norm):
        return text, enriched_html
    # Only consume the heading itself — not prose that happens to open
    # with the same characters (guard: next char must be whitespace/newline).
    rest = stripped[len(title_norm):]
    if rest and not rest[0] in '\n\r \t':
        return text, enriched_html
    text = rest.lstrip('\n').lstrip()
    # Strip the first heading tag from the html counterpart too
    # Real-world headings wrap the text in anchors/spans:
    # <h1 class="sequence" id="…"><a id="…"></a>序</h1> — allow inline
    # tags around the title text.
    enriched_html = re.sub(
        r'<h[1-3][^>]*>(?:<[^>]+>)*\s*' + re.escape(title_norm) + r'\s*(?:<[^>]+>)*</h[1-3]>',
        '', enriched_html, count=1,
    )
    return text, enriched_html


def _strip_dangerous_html(html: str) -> str:
    """Remove script tags, event handlers, and dangerous URLs from HTML."""
    # Strip NULL bytes and other control chars that browsers ignore when
    # resolving URL schemes. Without this, `java\x00script:alert(1)` bypasses
    # the URL regexes because they don't see `javascript:` contiguously.
    # Keep tab/newline/CR (\x09, \x0A, \x0D) since they're structural in HTML.
    html = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', html)
    html = _DANGEROUS_TAG_RE.sub('', html)
    html = _EVENT_HANDLER_RE.sub('', html)
    html = _SCRIPT_URL_RE.sub(r'\1=""', html)
    html = _DATA_URL_RE.sub(r'\1=""', html)
    return html
