"""Base PromptTemplate dataclass."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PromptTemplate:
    """A versioned prompt template."""

    key: str
    version: int
    template: str
    description: str = ''
    variables: list[str] = field(default_factory=list)
    output_format: str = 'text'  # 'text', 'json', 'json_array'
