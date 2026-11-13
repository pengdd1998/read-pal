"""Layer-3 bare ``<p id="note_N">`` footnote definitions (P8.2 / CROWD-2).

Crowdtest cross-validated 3/4: real publishing flows carry definition
paragraphs whose id rides on the ``<p>`` itself — no notecontent class, no
inner ``<a>`` anchor. Neither legacy layer matched, so the whole book's
footnote chain silently died. These tests pin extraction, backlink
exclusion, layer precedence, and strip symmetry.
"""

from __future__ import annotations

from app.services.parsers.epub.footnote_defs import (
    extract_footnote_definitions,
    strip_footnote_blocks,
)


class TestBareParagraphExtraction:
    def test_bare_p_definition_extracted(self):
        html = '<p>正文段落甲。</p><p id="note_3">脚注三的定义内容。</p>'
        defs = extract_footnote_definitions(html, 'ch0.html')
        assert defs.get('note_3') == '脚注三的定义内容。'

    def test_bare_p_english(self):
        html = '<p id="fn3">A definition body in English.</p>'
        assert extract_footnote_definitions(html, 'ch0.html').get('fn3') == 'A definition body in English.'

    def test_leading_backlink_marker_stripped(self):
        html = '<p id="note_3">[3] 定义内容开始。</p>'
        assert extract_footnote_definitions(html, 'ch0.html').get('note_3') == '定义内容开始。'

    def test_id_naming_families_all_match(self):
        for pid in ('note-3', 'note3', 'fn3', 'footnote-12', 'endnote_1', 'nt7'):
            html = f'<p id="{pid}">definition body text.</p>'
            assert pid in extract_footnote_definitions(html, 'ch0.html'), pid

    def test_attributes_around_id_supported(self):
        html = '<p class="calibre1" id="note_7" style="margin:0">styled body.</p>'
        assert extract_footnote_definitions(html, 'ch0.html').get('note_7') == 'styled body.'

    def test_backlink_ids_excluded(self):
        html = '<p id="noteBack_3">[3]</p><p id="fnref_2">see note 2.</p>'
        assert extract_footnote_definitions(html, 'ch0.html') == {}

    def test_bracket_only_body_skipped(self):
        html = '<p id="note_3">[3]</p>'
        assert extract_footnote_definitions(html, 'ch0.html') == {}

    def test_wrapper_layer_takes_precedence(self):
        # Same id in both shapes: the Layer-1 wrapper body wins.
        html = (
            '<p class="notecontent"><a id="note_3" href="#noteBack_3">[3]</a>层一定义。</p>'
            '<p id="note_3">层三重复定义。</p>'
        )
        defs = extract_footnote_definitions(html, 'ch0.html')
        assert len([k for k in defs if k == 'note_3']) == 1
        assert defs['note_3'] == '层一定义。'


class TestStripSymmetry:
    def test_extracted_bare_p_stripped_when_ids_passed(self):
        html = '<p>阅读流段落。</p><p id="note_3">定义内容全文。</p>'
        out = strip_footnote_blocks(html, {'note_3'})
        assert '定义内容全文' not in out
        assert '阅读流段落' in out

    def test_id_shape_without_capture_not_stripped(self):
        # Id matches the naming family but was never captured (e.g. bracket
        # -only body was skipped) — stripping is keyed on captured ids, so
        # an id-shape paragraph alone never disappears.
        html = '<p id="note_9">疑似正文但 id 形似脚注。</p>'
        out = strip_footnote_blocks(html, {'note_3'})
        assert '疑似正文但 id 形似脚注' in out

    def test_empty_capture_set_keeps_bare_p(self):
        html = '<p id="note_3">定义内容。</p>'
        assert '定义内容' in strip_footnote_blocks(html, set())

    def test_legacy_signature_unchanged(self):
        # No ids argument → old behavior: only notecontent wrappers drop.
        html = (
            '<p class="notecontent"><a id="note_1" href="#noteBack_1">[1]</a>one</p>'
            '<p id="note_2">two</p>'
        )
        out = strip_footnote_blocks(html)
        assert 'one' not in out
        assert 'two' in out
