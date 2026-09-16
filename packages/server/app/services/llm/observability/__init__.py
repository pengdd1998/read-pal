"""LLM observability package (split M3.2 — was one 696-line module).

_core: error classification, token/cost estimation, trace building,
       _log_call / _log_cache_hit (the sole structured-log exit).
_jsonl: append-only JSONL trace channel (engineering-upgrade B1).
_writer: async buffered LLMCallTrace persistence.

Public surface unchanged — every existing import keeps working.
"""

from app.services.llm.observability import _core, _jsonl, _usage, _writer
from app.services.llm.observability._core import *  # noqa: F401,F403
from app.services.llm.observability._jsonl import *  # noqa: F401,F403
from app.services.llm.observability._writer import *  # noqa: F401,F403


def __getattr__(name: str):
    # Underscore symbols aren't covered by star imports; forward lookups
    # to the submodule that owns them (defining module wins).
    for mod in (_core, _jsonl, _usage, _writer):
        if hasattr(mod, name):
            return getattr(mod, name)
    raise AttributeError(f'module {__name__!r} has no attribute {name!r}')
