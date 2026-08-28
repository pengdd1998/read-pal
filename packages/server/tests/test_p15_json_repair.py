"""P1.5 tests: JSON-repair retry ladder.

Validates that ``_repair_json`` recovers from common LLM JSON mistakes:
- Leading/trailing prose ("Sure, here's the JSON: {...}")
- Markdown fences (```json ... ```)
- Trailing commas (Python allows, strict JSON rejects)
- Combinations of the above

And that ``safe_llm_invoke`` no longer silently returns fallback for
repairable outputs.
"""

import pytest

from app.services.llm.text import (
    _extract_balanced_json,
    _repair_json,
    _strip_markdown_fences,
)


class TestStrictParseStage:
    """Stage 1: clean JSON passes through unchanged."""

    def test_clean_object(self):
        parsed, stage = _repair_json('{"key": "value"}')
        assert parsed == {'key': 'value'}
        assert stage == 'strict'

    def test_clean_array(self):
        parsed, stage = _repair_json('[1, 2, 3]')
        assert parsed == [1, 2, 3]
        assert stage == 'strict'

    def test_nested_clean(self):
        parsed, stage = _repair_json('{"a": {"b": [1, 2]}}')
        assert parsed == {'a': {'b': [1, 2]}}
        assert stage == 'strict'

    def test_whitespace_only_tolerated(self):
        parsed, stage = _repair_json('  {"k": 1}  ')
        assert parsed == {'k': 1}
        assert stage == 'strict'


class TestMarkdownFenceStripping:
    """Stage 1 (pre): markdown fences stripped before parse."""

    def test_json_fence(self):
        parsed, stage = _repair_json('```json\n{"k": 1}\n```')
        assert parsed == {'k': 1}
        assert stage == 'strict'

    def test_bare_fence(self):
        parsed, stage = _repair_json('```\n{"k": 1}\n```')
        assert parsed == {'k': 1}
        assert stage == 'strict'

    def test_fence_with_prose(self):
        parsed, stage = _repair_json(
            'Sure, here is the JSON:\n```json\n{"k": 1}\n```\nLet me know!'
        )
        assert parsed == {'k': 1}
        assert stage == 'strict'


class TestExtractBalancedStage:
    """Stage 2: extract outermost {...} or [...] when prose wraps output."""

    def test_leading_prose_no_fence(self):
        parsed, stage = _repair_json('Here is your data: {"k": 1}')
        assert parsed == {'k': 1}
        assert stage == 'extract_balanced'

    def test_trailing_prose(self):
        parsed, stage = _repair_json('{"k": 1} - hope this helps!')
        assert parsed == {'k': 1}
        assert stage == 'extract_balanced'

    def test_braces_inside_strings_ignored(self):
        """Critical: naive brace-counting would fail on this.

        The value "v{1}end" contains braces inside a string literal. A
        naive counter that doesn't respect string state would find a
        spurious closing brace mid-string and extract the wrong slice.
        """
        parsed, stage = _repair_json('Pattern: {"name": "v{1}end", "ok": true}')
        assert parsed == {'name': 'v{1}end', 'ok': True}
        assert stage == 'extract_balanced'

    def test_nested_objects(self):
        parsed, stage = _repair_json('Result: {"outer": {"inner": [1, 2, 3]}} done.')
        assert parsed == {'outer': {'inner': [1, 2, 3]}}
        assert stage == 'extract_balanced'

    def test_array_extraction(self):
        parsed, stage = _repair_json('Items: [1, 2, 3] end')
        assert parsed == [1, 2, 3]
        assert stage == 'extract_balanced'


class TestTrailingCommaStage:
    """Stage 3: trailing commas stripped before parse."""

    def test_object_trailing_comma(self):
        parsed, stage = _repair_json('{"k": 1,}')
        assert parsed == {'k': 1}
        assert stage in ('strip_trailing_commas', 'strict')

    def test_array_trailing_comma(self):
        parsed, stage = _repair_json('[1, 2, 3,]')
        assert parsed == [1, 2, 3]
        assert stage in ('strip_trailing_commas', 'strict')

    def test_nested_trailing_commas(self):
        parsed, stage = _repair_json('{"a": [1, 2,], "b": {"c": 3,},}')
        assert parsed == {'a': [1, 2], 'b': {'c': 3}}
        assert stage in ('strip_trailing_commas', 'strict')

    def test_prose_plus_trailing_comma(self):
        """Combined failure: prose AND trailing comma."""
        parsed, stage = _repair_json('Here: {"a": [1, 2,],}')
        assert parsed == {'a': [1, 2]}
        assert stage == 'extract_and_strip_commas'


class TestRepairExhausted:
    """When every stage fails, _repair_json signals exhaustion."""

    def test_garbage_returns_none(self):
        parsed, stage = _repair_json('totally not json at all')
        assert parsed is None
        assert stage is None

    def test_truncated_object_recovers_prefix(self):
        """Missing closing brace — stage 4 (close_truncated) now recovers
        the complete prefix instead of returning None (empty fallback)."""
        parsed, stage = _repair_json('{"k": 1, "k2": ')
        assert stage == 'close_truncated'
        assert parsed == {'k': 1}

    def test_empty_returns_none(self):
        parsed, stage = _repair_json('')
        assert parsed is None
        assert stage is None


class TestExtractBalancedJson:
    """Direct tests of the balanced-extraction helper."""

    def test_no_braces_returns_none(self):
        assert _extract_balanced_json('hello world') is None

    def test_unclosed_returns_none(self):
        assert _extract_balanced_json('{"k": ') is None

    def test_string_with_braces(self):
        extracted = _extract_balanced_json('{"k": "v}{"}')
        assert extracted == '{"k": "v}{"}'

    def test_escape_sequences_respected(self):
        # Backslash-escaped quote inside string shouldn't end the string
        extracted = _extract_balanced_json(r'{"k": "a\"b}c"}')
        assert extracted == r'{"k": "a\"b}c"}'


class TestSafeLlmInvokeUsesRepair:
    """Integration: safe_llm_invoke returns parsed JSON even when wrapped."""

    @pytest.mark.asyncio
    async def test_prose_wrapped_json_does_not_return_fallback(self, monkeypatch):
        """Before P1.5, prose-wrapped JSON silently returned fallback.

        After P1.5, _repair_json's extract_balanced stage recovers it.
        """
        from app.services.llm import safe_invoke

        # Bypass cache + circuit by stubbing the inner invoke
        async def fake_invoke(messages, **kwargs):
            response = type('R', (), {'content': 'Sure! Here: {"answer": 42}'})()
            return response

        # Disable cache by forcing key to empty
        monkeypatch.setattr(
            'app.services.llm.cache._cache_key',
            lambda *a, **kw: '',
        )
        monkeypatch.setattr(
            'app.services.llm.safe_invoke._invoke_with_circuit',
            fake_invoke,
        )

        result = await safe_invoke.safe_llm_invoke(
            [], log_label='TEST', use_cache=False,
        )
        assert result == {'answer': 42}


class TestCloseTruncatedJson:
    """Stage 4: reasoning models can hit the token cap mid-JSON; recover the
    complete prefix instead of returning the fallback (empty)."""

    def test_truncated_mid_string_recovers_prefix(self):
        from app.services.llm.text import _close_truncated_json
        import json
        r = _close_truncated_json('{"concepts": [{"name": "Hope", "type": "theme"}, {"name": "Gr')
        assert r is not None
        parsed = json.loads(r)
        assert parsed['concepts'][0]['name'] == 'Hope'

    def test_truncated_key_colon(self):
        from app.services.llm.text import _close_truncated_json
        import json
        r = _close_truncated_json('{"cards": [{"q": "a"}, {"front":')
        assert r is not None and json.loads(r)['cards'][0]['q'] == 'a'

    def test_truncated_bare_array(self):
        from app.services.llm.text import _close_truncated_json
        import json
        r = _close_truncated_json('[{"n": 1}, {"n":')
        assert r is not None and json.loads(r)[0]['n'] == 1

    def test_dangling_comma_closed(self):
        from app.services.llm.text import _close_truncated_json
        import json
        r = _close_truncated_json('{"concepts": [{"name": "Hope"}],')
        assert r is not None
        assert json.loads(r) == {'concepts': [{'name': 'Hope'}]}

    def test_balanced_input_returns_none(self):
        from app.services.llm.text import _close_truncated_json
        assert _close_truncated_json('{"a": 1}') is None

    def test_repair_ladder_uses_close_truncated(self):
        from app.services.llm.text import _repair_json
        parsed, stage = _repair_json('{"concepts": [{"name": "Hope"}, {"name":', log_label='T')
        assert stage == 'close_truncated'
        assert parsed['concepts'][0]['name'] == 'Hope'
