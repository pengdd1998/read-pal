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

from app.services.parsers.epub.html_helpers import resolve_epub_path

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


def scoped_footnote_key(chapter_index: int, anchor_id: str) -> str:
    """Metadata-map key for a definition owned by chapter ``chapter_index``."""
    return f'rpfnd-ch{chapter_index}-{anchor_id}'


def rewrite_footnote_hrefs(
    html: str,
    src_file: str,
    file_to_idx: dict[str, int],
) -> str:
    """Point marker anchors at their chapter-scoped definition keys.

    ``href="part0003.html#note_1"`` (cross-file InDesign form) and
    ``href="#note_1"`` (same-file form) both become
    ``href="#rpfnd-ch{i}-note_1"`` where ``i`` is the final chapter index
    of the file that owns the definition. The scoped fragment is an
    opaque lookup key for the metadata map — collision-free across the
    per-chapter note numbering. Targets outside the surviving chapter
    list keep their original href (frontend shows its cross-ref
    fallback); noteBack_/fnref_ backlinks are never touched.
    """
    def _sub(m: re.Match) -> str:
        file_part, _, frag = m.group(2).partition('#')
        resolved = resolve_epub_path(src_file, file_part) if file_part else src_file
        idx = file_to_idx.get(resolved)
        if idx is None:
            return m.group(0)
        return f'{m.group(1)}#{scoped_footnote_key(idx, frag)}{m.group(3)}'

    return _MARKER_HREF_RE.sub(_sub, html)


# Marker anchors whose href targets a definition id (mirrors
# FOOTNOTE_REF_RE's fragment rules; captures the href value).
_MARKER_HREF_RE = re.compile(
    r'(<a\s[^>]*?href\s*=\s*["\'])'
    r'([^"\']*#(?:note(?!back)|fn(?!ref)|footnote|endnote)[\w.-]*)'
    r'(["\'])',
    re.IGNORECASE,
)
