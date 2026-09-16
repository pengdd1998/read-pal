"""Footnote detection and annotation for EPUB content."""

import logging
import re

from app.services.parsers.epub.constants import FOOTNOTE_REF_RE

logger = logging.getLogger('read-pal')

# InDesign exports carry class="calibre2" on every anchor — merge into the
# existing class attribute instead of emitting a duplicate.
_CLASS_ATTR_RE = re.compile(r'class\s*=\s*(["\'])', re.IGNORECASE)


def annotate_footnotes(html_content: str) -> str:
    """Add the rp-footnote-ref class to footnote reference markers."""
    try:
        def _inject(m: re.Match) -> str:
            tag = m.group(0)
            if _CLASS_ATTR_RE.search(tag):
                return _CLASS_ATTR_RE.sub(
                    lambda c: f'class={c.group(1)}rp-footnote-ref ', tag, count=1,
                )
            return tag[:-1] + ' class="rp-footnote-ref">'

        html_content = FOOTNOTE_REF_RE.sub(_inject, html_content)
    except (ValueError, TypeError) as exc:
        logger.warning('epub_parser.footnote_css_failed', error=str(exc)[:200])
    return html_content
