"""Shared HTML/text conversion helpers used by EPUB and PDF processing."""

import html as html_module
import re

# Pre-compiled regex patterns for HTML processing
_BLOCK_ELEMENTS = re.compile(
    r'</(p|div|h[1-6]|li|blockquote|section|article|tr|td|dt|dd|ul|ol|table|header|footer|main|nav|aside|figure|figcaption|details|summary|address)>',
    re.IGNORECASE,
)
_INLINE_BREAKS = re.compile(r'<br\s*/?\s*>', re.IGNORECASE)
_HTML_TAG = re.compile(r'<[^>]+>')
_HORIZONTAL_WS = re.compile(r'[^\S\n]+')
_EXCESS_NEWLINES = re.compile(r'\n{3,}')
_PARAGRAPH_SPLIT = re.compile(r'\n\s*\n')


def fix_garbled_cjk(text: str) -> str:
    """Fix garbled CJK text caused by GBK bytes misinterpreted as Latin-1."""
    cjk_count = len(re.findall(r'[一-鿿]', text))
    total_chars = len(text.replace(' ', ''))
    if total_chars == 0 or cjk_count / max(total_chars, 1) >= 0.05:
        return text

    latin1_suspicious = len(re.findall(r'[À-ÿ¡-¿]', text))
    if latin1_suspicious < 3:
        return text

    try:
        raw_bytes = text.encode('latin-1', errors='ignore')
        fixed = raw_bytes.decode('gbk', errors='replace')
        fixed_cjk = len(re.findall(r'[一-鿿]', fixed))
        if fixed_cjk > cjk_count * 2:
            return fixed
    except (UnicodeDecodeError, UnicodeEncodeError):
        pass

    return text


def html_to_structured_text(html_content: str) -> str:
    """Extract text from HTML preserving paragraph breaks."""
    text = _INLINE_BREAKS.sub('\n', html_content)
    text = _BLOCK_ELEMENTS.sub('\n\n', text)
    text = _HTML_TAG.sub('', text)
    text = html_module.unescape(text)
    text = _HORIZONTAL_WS.sub(' ', text)
    text = _EXCESS_NEWLINES.sub('\n\n', text)
    lines = [line.strip() for line in text.split('\n')]
    return '\n'.join(lines).strip()


def text_to_html_paragraphs(text: str) -> str:
    """Convert plain text to HTML with <p> tags for rendering."""
    paragraphs = _PARAGRAPH_SPLIT.split(text)
    parts: list[str] = []
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        escaped = html_module.escape(p)
        escaped = escaped.replace('\n', '<br>\n')
        parts.append(f'<p>{escaped}</p>')
    return '\n'.join(parts)
