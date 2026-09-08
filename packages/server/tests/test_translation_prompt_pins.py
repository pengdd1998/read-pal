"""Content pins for the i18n-hosted companion prompts (engineering-upgrade B2).

The companion system/socratic prompts live in ``app/translations/{en,zh}.json``
— outside the ``PromptTemplate`` version system that covers every prompt in
``app/prompts/``. Without these pins, a wording edit to the JSON lands with
no review gate: no version bump, no diff-visible signal that prompt content
changed (only the MD5-hash ``prompt_version`` in llm_call_traces drifts).

These sha256 pins restore the gate: any edit to these four strings fails CI
until the pin is consciously updated here. To change a pinned prompt:

1. Edit the string in ``app/translations/{en,zh}.json``.
2. Update the matching pin below (the assertion error prints the new hash).
3. In the same PR, state the change rationale and attach the mock-eval
   report (``uv run python -m app.eval.eval_runner``) — same discipline as a
   ``version=`` bump on a ``PromptTemplate``.
4. Trace-side ``prompt_version`` is hash-derived for these prompts, so no
   code change is needed there.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pytest

TRANSLATIONS_DIR = Path(__file__).parent.parent / 'app' / 'translations'

# (locale, key) -> first 16 hex chars of sha256(content). See module docstring
# for the bump procedure.
_PINS: dict[tuple[str, str], str] = {
    ('en', 'system_prompt'): '1fc01e331f55ae8d',
    ('en', 'socratic_prompt'): '6b5abdf8fd729992',
    ('zh', 'system_prompt'): 'e52a46dc2a8c8f0e',
    ('zh', 'socratic_prompt'): '943b1ff71c84b7a2',
}

# Placeholders every pinned prompt must carry (parity with
# test_p43_prompt_injection_delimiters, restated here so a pin bump that
# drops a placeholder fails with a precise message).
_REQUIRED_PLACEHOLDERS = {'title', 'author', 'progress_line', 'spoiler_block', 'untrusted_notice'}


def _load(locale: str, key: str) -> str:
    data = json.loads((TRANSLATIONS_DIR / f'{locale}.json').read_text(encoding='utf-8'))
    return data['companion'][key]


@pytest.mark.parametrize('locale,key', sorted(_PINS))
class TestTranslationPromptPins:
    def test_content_matches_pin(self, locale: str, key: str) -> None:
        content = _load(locale, key)
        digest = hashlib.sha256(content.encode()).hexdigest()[:16]
        assert digest == _PINS[(locale, key)], (
            f'companion.{key} [{locale}] changed (pin {_PINS[(locale, key)]!r} != '
            f'actual {digest!r}). If intentional: update the pin here, attach the '
            f'mock-eval report, and state the rationale in the PR — see this '
            f'module docstring. Never update the pin to "make CI green" without '
            f'those two steps.'
        )

    def test_required_placeholders_present(self, locale: str, key: str) -> None:
        content = _load(locale, key)
        found = set(re.findall(r'\{([a-z_]+)\}', content))
        missing = _REQUIRED_PLACEHOLDERS - found
        assert not missing, f'companion.{key} [{locale}] lost placeholders: {sorted(missing)}'

    def test_placeholder_parity_with_english(self, locale: str, key: str) -> None:
        if locale == 'en':
            pytest.skip('en is the reference locale')
        found = set(re.findall(r'\{([a-z_]+)\}', _load(locale, key)))
        reference = set(re.findall(r'\{([a-z_]+)\}', _load('en', key)))
        assert found == reference, (
            f'{locale}/en placeholder drift for companion.{key}: '
            f'only-{locale}={sorted(found - reference)} '
            f'only-en={sorted(reference - found)}'
        )
