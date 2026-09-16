"""Gutenberg boilerplate scrubbing (header/license markers) and its wiring
into chapter building. Was: license tail riding the last chapter, fake
first chapter = title/credits page, NCX titles like
"THE FULL PROJECT GUTENBERG™ LICENSE"."""
from app.services.epub_parser.boilerplate import (
    scrub_chapter,
    scrub_html,
    scrub_text,
)
from app.services.epub_parser.zipfile_path import _is_toc_page

HEADER = 'The Project Gutenberg eBook of Test Book\n\nThis eBook is for the use of anyone anywhere'
START = '*** START OF THE PROJECT GUTENBERG EBOOK TEST BOOK ***'
END = '*** END OF THE PROJECT GUTENBERG EBOOK TEST BOOK ***'
LICENSE = 'Updated editions will replace the previous one—the old editions will be renamed.'


class TestScrubText:
    def test_header_and_license_removed(self):
        text = f'{HEADER}\n\n{START}\n\nChapter 1 prose here.\n\n{END}\n\n{LICENSE}'
        assert scrub_text(text) == 'Chapter 1 prose here.'

    def test_no_markers_untouched(self):
        text = 'Plain chapter text without any markers.'
        assert scrub_text(text) == text

    def test_license_only_becomes_empty(self):
        assert scrub_text(f'{END}\n\n{LICENSE}') == ''

    def test_marker_missing_end_keeps_tail(self):
        # Header marker present, end marker absent: only header is cut.
        text = f'{HEADER}\n\n{START}\n\nProse without end marker.'
        assert scrub_text(text) == 'Prose without end marker.'


class TestScrubHtml:
    def test_cuts_snap_to_p_boundaries(self):
        html = (
            '<p>The Project Gutenberg eBook of X</p>'
            '<p> redistribution notice </p>'
            f'<p>{START}</p>'
            '<p>Real content.</p>'
            f'<p>{END}</p>'
            f'<p>{LICENSE}</p>'
        )
        assert scrub_html(html) == '<p>Real content.</p>'

    def test_leading_style_block_preserved(self):
        html = (
            '<style>body{margin:0}</style>\n'
            f'<p>{HEADER}…</p><p>{START}</p><p>Content.</p>'
        )
        out = scrub_html(html)
        assert out.startswith('<style>')
        assert out.endswith('<p>Content.</p>')

    def test_no_dangling_tags(self):
        html = f'<p>prefix</p><p>{START}</p><p>Content with <em>emphasis</em>.</p><p>{END}</p><p>license…</p>'
        out = scrub_html(html)
        assert out.count('<p>') == out.count('</p>')

    def test_no_markers_untouched(self):
        html = '<p>Plain</p>'
        assert scrub_html(html) == html


class TestScrubChapter:
    def test_boilerplate_title_rederived_from_first_line(self):
        text = f'{START}\n\nCHAPTER XII.\nAlice\u2019s Evidence\n\nProse…\n\n{END}\n\n{LICENSE}'
        html = f'<p>{START}</p><h2>CHAPTER XII.</h2><p>Alice\u2019s Evidence</p>'
        new_text, _, title, keep = scrub_chapter(
            text, html, 'THE FULL PROJECT GUTENBERG\u2122 LICENSE')
        assert keep is True
        assert title == 'CHAPTER XII.'
        assert 'GUTENBERG' not in new_text

    def test_license_only_chapter_dropped(self):
        _, _, _, keep = scrub_chapter(f'{END}\n\n{LICENSE}', f'<p>{END}</p><p>{LICENSE}</p>',
                                      'THE FULL PROJECT GUTENBERG\u2122 LICENSE')
        assert keep is False

    def test_normal_title_kept(self):
        text, _, title, keep = scrub_chapter('第一章 正文' * 10, '<p>第一章 正文</p>', '第一章')
        assert keep is True and title == '第一章'


class TestTocPageAfterScrub:
    def test_gutenberg_contents_page_flagged_by_links(self):
        """Scrubbed link-TOC page must be skipped."""
        html = (
            f'<p>{START}</p><h2>Contents</h2>'
            + ''.join(f'<p><a href="ch{i}.xhtml">Chapter {i}: Some Long Title Here</a></p>' for i in range(1, 9))
        )
        text = 'Contents\n\n' + '\n\n'.join(f'Chapter {i}: Some Long Title Here' for i in range(1, 9))
        assert _is_toc_page(scrub_html(html), scrub_text(f'{HEADER}\n{START}\n{text}')) is True

    def test_plain_text_contents_flagged_by_title(self):
        """Old Gutenberg files render the TOC as plain text with no internal
        links — only the NCX title "Contents" identifies them (alice case)."""
        text = "Alice's Adventures in Wonderland\n\nby Lewis Carroll\n\nI. Down the Rabbit-Hole\n\nII. The Pool of Tears"
        assert _is_toc_page('<p>' + text + '</p>', text, title='Contents') is True
        # Same page under a real chapter title must survive.
        assert _is_toc_page('<p>' + text + '</p>', text, title='I. Down the Rabbit-Hole') is False

    def test_real_chapter_still_not_flagged(self):
        text = '正文内容。' * 100
        assert _is_toc_page('<html><body><h1>1</h1><p>' + text + '</p></body></html>', text) is False


class TestCoalesceFragments:
    """摄入侧断段合并（与阅读器渲染层 coalesce-paragraphs 同规则）。"""

    def test_giga_ntic_merged_html(self):
        from app.services.epub_parser.boilerplate import coalesce_fragments_html
        html = ('<p>the eyes of Doctor T.J. Eckleburg are blue and giga</p>'
                '<p>ntic — their retinas are one yard high.</p>')
        out = coalesce_fragments_html(html)
        assert out.count('<p') == 1
        assert 'giga ntic' in out

    def test_giga_ntic_merged_text(self):
        from app.services.epub_parser.boilerplate import coalesce_fragments_text
        text = 'the eyes of Doctor T.J. Eckleburg are blue and giga\n\nntic — their retinas are one yard high.'
        out = coalesce_fragments_text(text)
        assert '\n\n' not in out
        assert 'giga ntic' in out

    def test_terminal_punctuation_blocks_merge(self):
        from app.services.epub_parser.boilerplate import coalesce_fragments_html
        html = '<p>She sighed. It was over.</p><p>but not for me.</p>'
        assert coalesce_fragments_html(html).count('<p') == 2

    def test_chinese_never_merged(self):
        from app.services.epub_parser.boilerplate import coalesce_fragments_html
        html = '<p>黄昏时分，码头上的灯火次第亮</p><p>起，渔船随潮水轻轻摇晃。</p>'
        assert coalesce_fragments_html(html).count('<p') == 2

    def test_heading_between_blocks_merge(self):
        from app.services.epub_parser.boilerplate import coalesce_fragments_html
        html = '<p>end of scene tw</p><h2>Chapter 3</h2><p>o separate blocks.</p>'
        out = coalesce_fragments_html(html)
        assert out.count('<p') == 2 and '<h2>' in out

    def test_inline_markup_preserved(self):
        from app.services.epub_parser.boilerplate import coalesce_fragments_html
        html = '<p class="x">the <em>eyes</em> of Doc</p><p>tor Eckleburg kept vigil.</p>'
        out = coalesce_fragments_html(html)
        assert '<em>eyes</em>' in out and out.startswith('<p class="x">')
