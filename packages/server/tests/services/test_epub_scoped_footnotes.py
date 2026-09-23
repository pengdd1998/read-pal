"""Chapter-scoped footnote definitions (2026-09-23 badcase: 路边野餐).

Per-chapter footnote numbering restarts — every chapter defines its own
``note_1``. The old flat ``{anchorId: text}`` map was merged across spine
files with ``dict.update``, so whichever notes-bearing file was processed
last silently overwrote every earlier chapter: marker [1] in chapter 2
popped another chapter's note_1 (a Kipling bio instead of the pound-unit
note). The chapter-end ``notecontent`` definition blocks also leaked into
the reading flow as plain paragraphs, and the reader's segment-scoped
``getElementById`` could not find the definition, so the click always fell
through to the corrupted flat map.

Regression fixture mirrors the real book's shape: two chapters, each with
cross-file InDesign-style marker hrefs (``href="part000N.html#note_1"``)
and ``notecontent`` definition paragraphs with colliding ``note_1`` ids.
"""

import zipfile

import pytest

from app.services.parsers.epub import process_epub

_CH1_BODY = (
    '<p class="bodycontent">题词引自吉卜林作品。每个都有14磅'
    '<span class="subscript"><a href="part0002.html#note_1" id="noteBack_1" class="calibre2">[1]</a></span>重。</p>'
)
_CH1_NOTES = (
    '<p class="notecontent"><a href="part0002.html#noteBack_1" id="note_1" class="calibre2">[1]</a>约瑟夫·罗德亚德·吉卜林（Joseph Rudyard Kipling，1865—1936），英国小说家、诗人。</p>'
    '<p class="notecontent"><a href="part0002.html#noteBack_2" id="note_2" class="calibre2">[2]</a>此类标记为原注。</p>'
)
_CH2_BODY = (
    '<p class="bodycontent">那只是两张茶碟大小、四分之一英寸'
    '<span class="subscript"><a href="part0003.html#note_1" id="noteBack_1" class="calibre2">[1]</a></span>厚的铜制圆盘。</p>'
)
_CH2_NOTES = (
    '<p class="notecontent"><a href="part0003.html#noteBack_1" id="note_1" class="calibre2">[1]</a>英制质量单位，1磅约等于0.45千克。——编者注</p>'
    '<p class="notecontent"><a href="part0003.html#noteBack_2" id="note_2" class="calibre2">[2]</a>英制长度单位，1英寸约等于2.54厘米。</p>'
)


def _write_epub(path, files: dict[str, str]) -> str:
    with zipfile.ZipFile(path, 'w') as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return str(path)


@pytest.fixture
def colliding_notes_epub(tmp_path):
    return _write_epub(tmp_path / 'book.epub', {
        'part0002.html': f'<html><body><h1>1</h1>{_CH1_BODY}{_CH1_NOTES}</body></html>',
        'part0003.html': f'<html><body><h1>2</h1>{_CH2_BODY}{_CH2_NOTES}</body></html>',
    })


@pytest.mark.asyncio
async def test_colliding_note_ids_kept_per_chapter(colliding_notes_epub):
    """note_1 in ch1 and ch2 must land as two distinct scoped entries."""
    result = await process_epub(colliding_notes_epub)
    defs = result['metadata']['footnote_definitions']
    assert defs['rpfnd-ch0-note_1'] != defs['rpfnd-ch1-note_1']
    assert '吉卜林' in defs['rpfnd-ch0-note_1']
    assert '0.45千克' in defs['rpfnd-ch1-note_1']
    assert '2.54厘米' in defs['rpfnd-ch1-note_2']
    # No flat legacy keys remain — they were the collision surface.
    assert 'note_1' not in defs


@pytest.mark.asyncio
async def test_definition_blocks_stripped_from_chapters(colliding_notes_epub):
    """notecontent paragraphs must not leak into reading flow or text."""
    result = await process_epub(colliding_notes_epub)
    ch1, ch2 = result['chapters']
    for ch in (ch1, ch2):
        assert 'notecontent' not in ch['rawContent']
        assert '编者注' not in ch['rawContent']
        assert '编者注' not in ch['content']
    # Chapter bodies survive the strip.
    assert '铜制圆盘' in ch2['rawContent']


@pytest.mark.asyncio
async def test_marker_hrefs_rewritten_to_scoped_keys(colliding_notes_epub):
    """Markers point at their own chapter's scoped definition key."""
    result = await process_epub(colliding_notes_epub)
    ch1, ch2 = result['chapters']
    assert 'href="#rpfnd-ch0-note_1"' in ch1['rawContent']
    assert 'href="#rpfnd-ch1-note_1"' in ch2['rawContent']
    # Definition-side backlink hrefs were stripped with the block; markers
    # keep their own noteBack ids (that is the marker side of the pair).
    assert '#noteBack' not in ch1['rawContent'] and '#noteBack' not in ch2['rawContent']


@pytest.mark.asyncio
async def test_markers_still_annotated_for_click_interception(colliding_notes_epub):
    """rp-footnote-ref class survives the rewrite (reader intercepts on it)."""
    result = await process_epub(colliding_notes_epub)
    for ch in result['chapters']:
        assert 'rp-footnote-ref' in ch['rawContent']


@pytest.mark.asyncio
async def test_unresolvable_marker_keeps_original_href(tmp_path):
    """Marker targeting a filtered-out file keeps its href (graceful path)."""
    epub = _write_epub(tmp_path / 'book.epub', {
        'part0002.html': (
            '<html><body><h1>1</h1><p>' + '这是足够长的正文内容，用来避免被目录页判定过滤。' * 40
            + '正文<a href="notes.html#note_1" id="noteBack_1">[1]</a>。</p></body></html>'
        ),
    })
    result = await process_epub(epub)
    ch = result['chapters'][0]
    assert 'href="notes.html#note_1"' in ch['rawContent']
    assert 'footnote_definitions' not in result['metadata'] or (
        'rpfnd-ch0-note_1' not in result['metadata'].get('footnote_definitions', {})
    )
