"""Footnote definition extraction — build the anchor→body table.

EPUB footnotes come in two shapes:
1. Reference markers in chapter bodies: ``<a class="rp-footnote-ref"
   href="notes.xhtml#fn3">[3]</a>`` (annotated by ``annotate_footnotes``).
2. Definition bodies, usually in a back-matter chapter: elements with
   ``id="fn3"`` (or note/endnote variants) containing the note text.

``extract_footnote_definitions`` scans every spine file for definition
elements and returns ``{anchorId: plainText}``. The orchestrator stores
this map on the Book's Document metadata (``metadata_.footnotes``) so
the reader's footnote popover can render note bodies without navigation
— clicking a reference used to navigate out of the SPA and 404.
"""

from __future__ import annotations

import re

import structlog

logger = structlog.get_logger('read-pal.epub_parser')

# Definition anchors: id/note/endnote/fn prefixes plus generic
# "note-3"/"footnote-12" style ids. Case-insensitive.
_DEF_ID_RE = re.compile(
    r'^(?:fn|footnote|note|endnote|nt)[-_]?[\w.-]+$', re.IGNORECASE,
)
# Wrapper elements carrying the definition body (LuBianYeCan shape:
# <p class="notecontent"><a ... id="note_3">[3]</a>body</p>).
_WRAPPER_RE = re.compile(
    r'<p[^>]*class="[^"]*notecontent[^"]*"[^>]*>(.*?)</p>',
    re.DOTALL | re.IGNORECASE,
)
# The definition anchor inside the wrapper: <a ... id="note_3">[3]</a>body
_WRAPPER_ID_RE = re.compile(r'id="(note[\w-]*)"[^>]*>\s*(\[\d+\])?\s*</a>')
_DEF_ELEMENT_RE = re.compile(
    r'<a[^>]*\bid="(fn[\w-]*|note[\w-]*)"[^>]*>(.*?)</a>',
    re.DOTALL | re.IGNORECASE,
)
_TAG_RE = re.compile(r'<[^>]+>')

# Total-size valve: each definition is already capped at 2000 chars; this
# bounds the whole map (<= ~1 MB) so a pathological EPUB cannot balloon
# Book.metadata_ and every book-detail response.
MAX_FOOTNOTE_DEFS = 500  # P7.2 — total-size valve; per-entry caps alone don't bound metadata_


def _strip_tags(html: str) -> str:
    return re.sub(r'\s+', ' ', _TAG_RE.sub('', html)).strip()


def _is_definition_anchor(el_id: str) -> bool:
    return bool(_DEF_ID_RE.match(el_id))


def extract_footnote_definitions(raw_html: str, chapter_href: str) -> dict[str, str]:
    """Extract ``{definitionId: plainText}`` from one spine file.

    Handles the LuBianYeCan shape: the reading chapter contains BOTH the
    clickable marker (``id="noteBack_N"``) and, a few paragraphs later,
    the definition (``id="note_N"`` with the note text). Definitions are
    keyed by their own id; per-chapter numbering restarts (chapter 1 and
    chapter 2 both define ``note_1``), so callers must NOT merge results
    across files into one flat dict — the last file would silently
    overwrite every earlier chapter's notes (2026-09-23 badcase: marker
    [1] popped another chapter's Kipling bio).
    """
    out: dict[str, str] = {}

    # Layer 1: notecontent wrappers — strip the leading [N] backlink
    # anchor, keep the body text. Keyed by the anchor id (note_N).
    for m in _WRAPPER_RE.finditer(raw_html):
        inner = m.group(1)
        id_m = _WRAPPER_ID_RE.search(inner)
        if not id_m:
            continue
        body = inner[id_m.end():]
        text = _strip_tags(body)
        if text:
            out[id_m.group(1)] = text[:2000]

    # Layer 2: bare anchor definitions <a id="fn3">body</a>.
    for m in _DEF_ELEMENT_RE.finditer(raw_html):
        el_id, body_html = m.group(1), m.group(2)
        if not _is_definition_anchor(el_id):
            continue
        text = _strip_tags(body_html)
        if not text or re.fullmatch(r'[\[\]0-9\s]+', text):
            continue
        if el_id not in out:
            out[el_id] = text[:2000]

    if out:
        logger.debug(
            'footnote_definitions_extracted file=%s count=%d',
            chapter_href, len(out),
        )
    return out


def strip_footnote_blocks(html: str) -> str:
    """Remove recognized notecontent definition paragraphs from chapter HTML.

    Pairs with extraction: once the note bodies live in the metadata map,
    keeping the ``<p class="notecontent">`` blocks in the chapter leaks
    them into the reading flow (2026-09-23 badcase: the whole end-of-
    chapter notes list rendered as plain paragraphs). Only wrappers whose
    inner anchor matches the definition shape are dropped — a
    ``notecontent`` paragraph without a definition anchor is ordinary
    content and stays.
    """
    def _drop(m: re.Match) -> str:
        return '' if _WRAPPER_ID_RE.search(m.group(1)) else m.group(0)

    return _WRAPPER_RE.sub(_drop, html)
