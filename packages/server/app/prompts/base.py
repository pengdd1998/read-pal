"""Base PromptTemplate dataclass."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

# Matches valid str.format placeholders: {name}, {name!r}, {name:spec}, etc.
# Double braces ({{ }}) are escapes and excluded.
_PLACEHOLDER_RE = re.compile(r'(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)(?:[!:][^{}]*)?\}(?!\})')

# P3.2: constrained set of output formats. A typo here (e.g. 'json-array')
# would silently land in trace logs without validation.
OutputFormat = Literal['text', 'json', 'json_array']


def _extract_placeholders(template: str) -> set[str]:
    """Return the set of {name} placeholders in a template string.

    Excludes ``{{`` / ``}}`` escape sequences.
    """
    return set(_PLACEHOLDER_RE.findall(template))


@dataclass(frozen=True)
class PromptTemplate:
    """A versioned prompt template."""

    key: str
    version: int
    template: str
    description: str = ''
    variables: list[str] = field(default_factory=list)
    output_format: OutputFormat = 'text'
    temperature: float | None = None  # Override default temperature (None = use pool default)
    max_tokens: int | None = None  # Override default max_tokens (None = use pool default)

    def __post_init__(self) -> None:
        """Validate declared variables match actual placeholders.

        Only enforced when ``variables`` is explicitly declared (non-empty).
        Templates with no declared variables are skipped — many system prompts
        legitimately contain literal JSON braces that should not be flagged.
        Drift between declared variables and template placeholders is a
        common source of KeyError at call time; catch it at import instead.
        """
        if not self.variables:
            return
        declared = set(self.variables)
        actual = _extract_placeholders(self.template)
        missing_in_template = declared - actual
        missing_in_declared = actual - declared
        if missing_in_template:
            raise ValueError(
                f'PromptTemplate {self.key!r}: variables declared but not '
                f'found in template: {sorted(missing_in_template)}'
            )
        if missing_in_declared:
            raise ValueError(
                f'PromptTemplate {self.key!r}: placeholders in template but '
                f'not declared in variables: {sorted(missing_in_declared)}'
            )

    def render(self, **kwargs: object) -> str:
        """Substitute placeholders in the template.

        Single, centralized substitution entry point. Coerces all values to
        ``str`` so callers can pass ints, floats, or None without formatting
        surprises. Note that ``str.format`` is already safe with respect to
        user-controlled values: braces inside substituted values are not
        re-parsed, so a book title like ``"{Excerpt}"`` is inserted verbatim
        rather than interpreted as a placeholder.

        Note: prompt-content translations are no longer looked up here —
        the ``prompts`` i18n namespace was removed during the i18n refactor.
        ``lang``-aware rendering, if needed, is the caller's responsibility
        (e.g., companion builds its prompt via ``app.utils.i18n.t``).
        """
        if not kwargs:
            return self.template
        return self.template.format(**{k: str(v) for k, v in kwargs.items()})
