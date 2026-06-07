"""Constants and pre-compiled regex patterns for EPUB processing."""

import re

# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------

MAX_IMAGE_SIZE = 2 * 1024 * 1024  # 2 MB per image before base64

IMAGE_MIME_MAP: dict[str, str] = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
}

# ---------------------------------------------------------------------------
# XML namespaces used in EPUB
# ---------------------------------------------------------------------------

NS_DC = 'http://purl.org/dc/elements/1.1/'
NS_OPF = 'http://www.idpf.org/2007/opf'
NS_NCX = 'http://www.daisy.org/z3986/2005/ncx/'
NS_EPUB = 'http://www.idpf.org/2007/ops'

# ---------------------------------------------------------------------------
# Pre-compiled regex patterns for EPUB HTML processing
# ---------------------------------------------------------------------------

IMG_SRC_RE = re.compile(
    r'(<img\s[^>]*src=["\'])([^"\']+)(["\'])', re.IGNORECASE,
)
TITLE_RE = re.compile(
    r'<title[^>]*>(.*?)</title>', re.IGNORECASE | re.DOTALL,
)
IMG_COUNT_RE = re.compile(r'<img[\s>]', re.IGNORECASE)

# CSS sanitization patterns
CSS_DANGEROUS = re.compile(
    r'(?:@import|expression\s*\(|-moz-binding|behavior\s*:|javascript\s*:)',
    re.IGNORECASE,
)
CSS_URL = re.compile(r'url\s*\([^)]*\)', re.IGNORECASE)
CSS_POSITION_BAD = re.compile(
    r'position\s*:\s*(?:fixed|absolute)', re.IGNORECASE,
)
CSS_FONT_FACE = re.compile(
    r'@font-face\s*\{[^}]*\}', re.IGNORECASE | re.DOTALL,
)

# Footnote detection patterns
FOOTNOTE_ATTRS = re.compile(
    r'(epub:type\s*=\s*["\']footnote["\']|role\s*=\s*["\']doc-footnote["\']'
    r'|class\s*=\s*["\'][^"\']*footnote[^"\']*["\']'
    r'|class\s*=\s*["\'][^"\']*endnote[^"\']*["\'])',
    re.IGNORECASE,
)
FOOTNOTE_REF_RE = re.compile(
    r'(<a\s[^>]*href\s*=\s*["\']#(?:fn|footnote|note|endnote)[^"\']*["\'])',
    re.IGNORECASE,
)

# Outer document wrapper patterns to strip from chapter HTML
OUTER_DOC_PROLOGUE = re.compile(
    r'^\s*(?:<\?xml[^?]*\?>\s*)?(?:<!DOCTYPE[^>]*>\s*)?',
    re.IGNORECASE,
)
OUTER_DOC_WRAPPER = re.compile(
    r'^\s*(?:<\?xml[^?]*\?>\s*)?(?:<!DOCTYPE[^>]*>\s*)?'
    r'<html[^>]*>\s*(?:<head[^>]*>.*?</head>\s*)?'
    r'<body[^>]*>(.*)</body>\s*</html>\s*$',
    re.IGNORECASE | re.DOTALL,
)
