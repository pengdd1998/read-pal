"""TOC-page detection: dedicated table-of-contents spine items must not
become chapters (was: dead 21-char '目录' chapter between 序 and 1)."""
from app.services.epub_parser.zipfile_path import _is_toc_page


def _toc_html() -> str:
    return '''<html><head><title>目录</title></head><body>
    <h1>目录</h1>
    <p><a href="part0001.html#x">序</a></p>
    <p><a href="part0003.html#x">1</a></p>
    <p><a href="part0004.html#x">2</a></p>
    </body></html>'''


class TestIsTocPage:
    def test_toc_page_detected(self):
        text = '目录\n\n目录\n\n序\n\n1\n\n2'
        assert _is_toc_page(_toc_html(), text) is True

    def test_real_chapter_not_flagged(self):
        html = '<html><body><h1>1</h1><p>' + '正文内容。' * 100 + '</p></body></html>'
        text = '正文内容。' * 100
        assert _is_toc_page(html, text) is False

    def test_footnote_only_page_not_flagged(self):
        html = '<html><body><p>注<a href="#fn1">[1]</a></p><p id="fn1">注释内容</p></body></html>'
        text = '注 [1] 注释内容'
        assert _is_toc_page(html, text) is False

    def test_empty_and_linkless(self):
        assert _is_toc_page('<html></html>', '') is False
        assert _is_toc_page('<html><p>短文无链接</p></html>', '短文无链接') is False


class TestStripDuplicateHeading:
    """Chapter heading text must not repeat inside the content body."""

    def test_leading_title_removed(self):
        from app.services.epub_parser.ebooklib_path import _strip_duplicate_heading
        text, html = _strip_duplicate_heading('序', '序\n\n厄休拉·勒古恩\n\n正文…', '<h1>序</h1><p>正文</p>')
        assert text.startswith('厄休拉·勒古恩'), text[:20]
        assert '序' not in html.split('</h1>')[0] or '<h1>序</h1>' not in html

    def test_prose_starting_with_same_chars_kept(self):
        from app.services.epub_parser.ebooklib_path import _strip_duplicate_heading
        # "1" is the title but prose starts with "1984年…" — guard rejects
        text, html = _strip_duplicate_heading('1', '1984年，天气炎热', '<p>1984年</p>')
        assert text == '1984年，天气炎热'

    def test_no_title_noop(self):
        from app.services.epub_parser.ebooklib_path import _strip_duplicate_heading
        text, html = _strip_duplicate_heading('', '正文', '<p>正文</p>')
        assert text == '正文' and html == '<p>正文</p>'
