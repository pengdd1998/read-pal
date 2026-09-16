/**
 * DOMPurify configuration that preserves technical formatting tags.
 *
 * Extracted from ReaderView so other components (e.g. annotation previews)
 * can reuse the same allowlist.
 */

export const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'blockquote', 'pre', 'code',
    'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'mark',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'img', 'figure', 'figcaption', 'picture', 'source',
    'a', 'span', 'div', 'section', 'article', 'aside', 'details', 'summary',
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'tspan',
    'del', 'ins', 'abbr', 'cite', 'dfn', 'kbd', 'samp', 'var', 'time',
    'sup', 'sub', 'ruby', 'rt', 'rp',
    'style',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id', 'style',
    'colspan', 'rowspan', 'headers', 'scope',
    'width', 'height', 'loading',
    'datetime', 'cite',
    // SVG attributes
    'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'points', 'viewBox', 'fill', 'stroke', 'stroke-width',
    'transform', 'xmlns', 'version', 'preserveAspectRatio',
    'font-family', 'font-size', 'text-anchor',
  ],
  ALLOW_DATA_ATTR: false,
};
