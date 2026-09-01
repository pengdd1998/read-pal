"""Gutenberg-style boilerplate scrubbing for parsed EPUB chapters.

Public-domain EPUBs (Project Gutenberg and repackagers of it) wrap every
spine file in boilerplate:

    [header: "The Project Gutenberg eBook of ..." + redistribution notice]
    *** START OF THE PROJECT GUTENBERG EBOOK <title> ***
    <actual book content, sometimes MULTIPLE chapters per file>
    *** END OF THE PROJECT GUTENBERG EBOOK <title> ***
    [full license text]

Unscrubbed, this leaks into read-pal as: a "chapter" whose NCX title is
"THE FULL PROJECT GUTENBERG™ LICENSE" (while its head is real prose, the
license rides its tail), a fake first chapter that is the title/credits
page, and license text polluting RAG chunks.

Scrubbing is marker-driven only (no sentence heuristics): we cut strictly
around the `*** START/END OF THE PROJECT GUTENBERG EBOOK ***` markers, so
books without the markers are returned untouched.
"""
from __future__ import annotations

import re

# Markers are single lines: "*** START OF THE PROJECT GUTENBERG EBOOK <title> ***".
# The lazy .*? stays on the marker line and consumes through the trailing ***.
START_MARKER_RE = re.compile(r'\*{3}\s*START OF THE PROJECT GUTENBERG EBOOK[^\n]*?\*{3}', re.IGNORECASE)
END_MARKER_RE = re.compile(r'\*{3}\s*END OF THE PROJECT GUTENBERG EBOOK[^\n]*?\*{3}', re.IGNORECASE)
# NCX titles on boilerplate pages look like "THE FULL PROJECT GUTENBERG™ LICENSE"
# or "The Project Gutenberg eBook of X, by Y" — re-derive from content instead.
BOILERPLATE_TITLE_RE = re.compile(r'project gutenberg', re.IGNORECASE)

MIN_CONTENT_CHARS = 20


def scrub_text(text: str) -> str:
    """Cut leading header and trailing license from structured chapter text."""
    m = START_MARKER_RE.search(text)
    if m:
        text = text[m.end():]
    m = END_MARKER_RE.search(text)
    if m:
        text = text[:m.start()]
    return text.strip()


def scrub_html(html: str) -> str:
    """Same cuts for the raw HTML payload, snapped to <p> block boundaries.

    Markers live inside their own <p> paragraphs; cutting at the raw marker
    offset would leave dangling half-tags, so we snap outward: forward past
    the marker paragraph's </p>, backward to the license <p>'s opening tag.
    A leading <style> block (book CSS prepended by _enrich_html) sits before
    the boilerplate header and is preserved.
    """
    prefix = ''
    style_m = re.match(r'\s*(<style[^>]*>.*?</style>)', html, re.DOTALL | re.IGNORECASE)
    if style_m:
        prefix = style_m.group(1)
        html = html[style_m.end():]

    m = START_MARKER_RE.search(html)
    if m:
        cut = m.end()
        p_end = html.find('</p>', cut)
        if p_end != -1 and p_end - cut <= 80:
            cut = p_end + len('</p>')
        html = html[cut:]

    m = END_MARKER_RE.search(html)
    if m:
        cut = m.start()
        p_start = html.rfind('<p', 0, cut)
        if p_start != -1 and cut - p_start <= 2000:
            cut = p_start
        html = html[:cut]

    return (prefix + html).strip()


def is_boilerplate_title(title: str | None) -> bool:
    return bool(title and BOILERPLATE_TITLE_RE.search(title))


_CREDIT_LINE_RE = re.compile(
    r'^(produced by|transcribed|prepared by|illustrated by|cover\.?)\b', re.IGNORECASE)


def rederive_title(scrubbed_text: str, fallback: str) -> str:
    """Title from the first meaningful line of scrubbed content.

    Gutenberg credits ("Produced by …") sit between the START marker and
    the book heading; skip them so chapter titles aren't credits lines.
    """
    for line in scrubbed_text.split('\n'):
        line = line.strip().strip('*').strip()
        if line and not _CREDIT_LINE_RE.match(line):
            return line[:80]
    return fallback


def scrub_chapter(content: str, raw_content: str, title: str) -> tuple[str, str, str, bool]:
    """Scrub one chapter. Returns (text, html, title, keep)."""
    text = scrub_text(content)
    html = scrub_html(raw_content)
    new_title = title
    if is_boilerplate_title(title):
        new_title = rederive_title(text, title)
    keep = len(text) >= MIN_CONTENT_CHARS
    return text, html, new_title, keep


# ---------------------------------------------------------------------------
# Paragraph-fragment coalescing (ingestion side of the split-paragraph fix)
# ---------------------------------------------------------------------------
# Mirrors the reader's render-layer merge (packages/web coalesce-paragraphs):
# an upstream-stored fragment is a <p> whose first alphabetic char is
# lowercase while the previous paragraph ends mid-sentence. CJK text has no
# case, so Chinese prose/poetry is never merged.

# Capturing group keeps the <p> blocks in split() output (alternating
# separator/p tokens); non-capturing split would discard them.
_P_TOKEN_RE = re.compile(r'(<p[^>]*>.*?</p>)', re.DOTALL | re.IGNORECASE)
_P_INNER_RE = re.compile(r'^<p[^>]*>(.*)</p>$', re.DOTALL | re.IGNORECASE)
_TERMINAL_END_CHARS = '。！？；.!?…」』'
_MID_SENTENCE_END_CHARS = set(
    'abcdefghijklmnopqrstuvwxyz0123456789,;:-–—\'"\u201c\u201d\u2019'
)


def _is_fragment_after(prev_text: str, cur_text: str) -> bool:
    m = re.search(r'[a-zA-Z]', cur_text)
    if not m or not m.group(0).islower():
        return False
    prev_text = prev_text.strip()
    if not prev_text:
        return False
    if prev_text[-1] in _TERMINAL_END_CHARS:
        return False
    return prev_text[-1] in _MID_SENTENCE_END_CHARS


def _tag_text(html: str) -> str:
    return re.sub(r'<[^>]+>', '', html).strip()


def coalesce_fragments_html(html: str) -> str:
    """Merge fragment <p> blocks into their predecessor (same rule as the
    reader's render-layer coalescing, applied at ingestion for clean RAG
    chunks). Non-blank separators (e.g. an <h2> between paragraphs) block
    the merge."""
    tokens = _P_TOKEN_RE.split(html)
    if len(tokens) <= 2:
        return html
    out: list[str] = []
    last_p = ''
    for i, tok in enumerate(tokens):
        if i % 2 == 0:  # separator between (or around) <p> blocks
            continue  # handled below, emitted lazily
        sep = tokens[i - 1]
        cur_text = _tag_text(tok)
        if (
            last_p
            and not sep.strip()
            and _is_fragment_after(_tag_text(last_p), cur_text)
        ):
            prev_inner = _P_INNER_RE.match(out[-1])
            cur_inner = _P_INNER_RE.match(tok)
            if prev_inner and cur_inner:
                open_tag_m = re.match(r'<p[^>]*>', out[-1])
                open_tag = open_tag_m.group(0) if open_tag_m else '<p>'
                out[-1] = f"{open_tag}{prev_inner.group(1)} {cur_inner.group(1)}</p>"
                last_p = out[-1]
                continue
        if sep:
            out.append(sep)
        out.append(tok)
        last_p = tok
    if tokens[-1]:
        out.append(tokens[-1])
    return ''.join(out)


def coalesce_fragments_text(text: str) -> str:
    """Same merge for structured text (blank-line separated paragraphs)."""
    paras = re.split(r'\n\s*\n', text)
    out: list[str] = []
    for para in paras:
        stripped = para.strip()
        if out and stripped and _is_fragment_after(out[-1].strip(), stripped):
            out[-1] = out[-1].rstrip() + ' ' + stripped
        else:
            out.append(para)
    return '\n\n'.join(out)
