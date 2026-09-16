"""Gate self-test: check_no_raw_book_fields must catch both the kwarg form
and the dict form, honor the inline rawfield exemption, and pass sanitized
values (M1.1 gate upgrade)."""

from pathlib import Path

from scripts.check_no_raw_book_fields import _check_file


def _violations(tmp_path: Path, source: str) -> list[tuple[int, str]]:
    f = tmp_path / 'sample_service.py'
    f.write_text(source, encoding='utf-8')
    return _check_file(f)


def test_kwarg_form_flagged(tmp_path):
    out = _violations(tmp_path, "prompt.format(title=book.title)\n")
    assert len(out) == 1 and 'kwargs' not in out[0][1] or out
    assert any('passed as title=' in msg for _, msg in out)


def test_dict_form_flagged(tmp_path):
    out = _violations(tmp_path, "meta = {'title': book.title, 'author': book.author}\n")
    assert len(out) == 2
    assert all('dict' in msg for _, msg in out)


def test_dict_form_exempted_with_rawfield_marker(tmp_path):
    out = _violations(
        tmp_path,
        "meta = {'title': book.title,  # rawfield: API response serialization\n"
        "        'author': book.author,  # rawfield: API response serialization\n"
        "        'progress': book.progress}\n",
    )
    assert out == []


def test_sanitized_dict_passes(tmp_path):
    out = _violations(
        tmp_path,
        "meta = {'title': sanitize_book_field(book.title, field='title'),\n"
        "        'author': sanitize_book_field(book.author, field='author')}\n",
    )
    assert out == []


def test_non_book_models_ignored(tmp_path):
    out = _violations(tmp_path, "row = {'title': other.title}\n")
    assert out == []


def test_kwarg_form_has_no_exemption(tmp_path):
    """The direct prompt-builder signature stays zero-exemption — a rawfield
    comment must NOT silence it."""
    out = _violations(
        tmp_path,
        "prompt.format(title=book.title)  # rawfield: tried to exempt\n",
    )
    assert len(out) == 1
