"""Footnote detection and annotation for EPUB content."""

import logging

from app.services.epub_parser.constants import FOOTNOTE_REF_RE

logger = logging.getLogger('read-pal')


def annotate_footnotes(html_content: str) -> str:
    """Add CSS classes to detected footnote elements and references."""
    try:
        html_content = FOOTNOTE_REF_RE.sub(
            lambda m: m.group(1) + ' class="rp-footnote-ref"',
            html_content,
        )
    except Exception as exc:
        logger.debug('epub_parser.footnote_css_failed', error=str(exc)[:200])
    return html_content
