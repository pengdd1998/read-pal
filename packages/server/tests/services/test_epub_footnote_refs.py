"""annotate_footnotes: marker-class injection across href shapes (M4 prod
verification found cross-file markers, e.g. InDesign exports writing
``href="part0001.html#note_1"``, got no class and the reader click
interceptor never fired)."""

from app.services.parsers.epub.footnotes import annotate_footnotes


def test_same_document_marker_gets_class():
    html = '<p>text<a href="#note_1" id="noteBack_1">[1]</a></p>'
    out = annotate_footnotes(html)
    assert '<a href="#note_1" id="noteBack_1" class="rp-footnote-ref">' in out


def test_cross_file_marker_gets_class():
    html = ('<p>text<span class="subscript">'
            '<a href="part0001.html#note_1" id="noteBack_1" class="calibre2">[1]</a>'
            '</span></p>')
    out = annotate_footnotes(html)
    assert 'class="rp-footnote-ref calibre2"' in out
    assert out.count('class=') == out.count('<a') + out.count('<span')


def test_backlink_marker_not_annotated():
    # Definition-side backlink points at noteBack_N — a marker, not a def.
    html = '<p class="notecontent"><a id="note_1" href="part0001.html#noteBack_1">[1]</a>note text</p>'
    out = annotate_footnotes(html)
    assert 'rp-footnote-ref' not in out


def test_fnref_marker_not_annotated():
    html = '<p><a href="#fnref_2" id="fn_2">^</a></p>'
    out = annotate_footnotes(html)
    assert 'rp-footnote-ref' not in out
