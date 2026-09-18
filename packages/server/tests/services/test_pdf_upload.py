"""PDF upload re-enablement (2026-09-18): parser caps, scanned detection.

Self-contained fixtures only — the repo's real PDFs live under a
gitignored docs path, so the minimal text PDF below is synthesized with a
correct xref table.
"""

from __future__ import annotations

import pytest

from app.services.parsers.pdf import (
    MAX_PDF_PAGES,
    MIN_PDF_TEXT_CHARS,
    PdfParseError,
    process_pdf,
)
from app.services.upload_service import validate_file


def _text_pdf(sentences: list[str]) -> bytes:
    """Build a minimal one-page PDF whose content stream draws `sentences`."""
    text = ' '.join(sentences)
    stream = f'BT /F1 12 Tf 72 720 Td ({text}) Tj ET'.encode()
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        (b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
         b'/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'),
        b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    out = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f'{i} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref_pos = len(out)
    out += f'xref\n0 {len(objects) + 1}\n'.encode()
    out += b'0000000000 65535 f \n'
    for off in offsets[1:]:
        out += f'{off:010d} 00000 n \n'.encode()
    out += (f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n'
            f'startxref\n{xref_pos}\n%%EOF').encode()
    return bytes(out)


class TestValidateFilePdf:
    def test_pdf_accepted(self):
        assert validate_file('paper.pdf', 1024) is None

    def test_pdf_case_insensitive(self):
        assert validate_file('Paper.PDF', 1024) is None

    def test_double_extension_still_pdf(self):
        assert validate_file('archive.epub.pdf', 1024) is None

    def test_jpg_still_rejected(self):
        assert validate_file('photo.jpg', 1024) is not None


class TestProcessPdfHappyPath:
    async def test_text_pdf_extracts_chapters(self, tmp_path):
        p = tmp_path / 'sample.pdf'
        p.write_bytes(_text_pdf([
            'The quick brown fox jumps over the lazy dog.',
            'Pack my box with five dozen liquor jugs.',
            'How vexingly quick daft zebras jump!',
        ] * 3))
        result = await process_pdf(str(p))
        assert result['total_pages'] == 1
        assert result['chapters'], 'fallback per-page chapter expected (no outline)'
        assert 'quick brown fox' in result['chapters'][0]['content']


class TestProcessPdfScannedDetection:
    async def test_blank_pages_rejected_as_scanned(self, tmp_path):
        from pypdf import PdfWriter

        writer = PdfWriter()
        for _ in range(3):
            writer.add_blank_page(width=612, height=792)
        p = tmp_path / 'scan.pdf'
        writer.write(p)

        with pytest.raises(PdfParseError) as exc_info:
            await process_pdf(str(p))
        assert exc_info.value.code == 'pdf_no_extractable_text'

    async def test_thin_text_rejected_under_threshold(self, tmp_path):
        p = tmp_path / 'thin.pdf'
        p.write_bytes(_text_pdf(['hi']))
        with pytest.raises(PdfParseError) as exc_info:
            await process_pdf(str(p))
        assert exc_info.value.code == 'pdf_no_extractable_text'
        assert exc_info.value.ctx['total_chars'] < MIN_PDF_TEXT_CHARS


class TestProcessPdfPageCap:
    async def test_page_cap_rejected(self, tmp_path, monkeypatch):
        class FakePage:
            def extract_text(self) -> str:
                return 'x' * 400  # healthy text, so only the cap can fire

        class FakeReader:
            def __init__(self, _path: str):
                self.pages = [FakePage()] * (MAX_PDF_PAGES + 1)
            @property
            def metadata(self):
                return {}
            @property
            def outline(self):
                return []

        import pypdf
        monkeypatch.setattr(pypdf, 'PdfReader', FakeReader)

        with pytest.raises(PdfParseError) as exc_info:
            await process_pdf(str(tmp_path / 'huge.pdf'))
        assert exc_info.value.code == 'pdf_too_many_pages'
        assert exc_info.value.ctx['actual_pages'] == MAX_PDF_PAGES + 1
