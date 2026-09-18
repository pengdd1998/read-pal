"""Live evaluation module (split M3.2 — was one 770-line file with PLR0915).

_cases: per-service golden handlers (study/synthesis/conversation/
        research/coach) — pure case assembly.
_runner: token estimation + run_live_eval orchestration.
_output: model attribution, report printing, baseline IO, main().
_report: LiveEvalReport dataclass.

Public surface unchanged — `from app.eval.live import X` replaces the
old `from app.eval.live_runner import X`.
"""

from app.eval.live._report import LiveEvalReport  # noqa: F401 — re-export
from app.eval.live._runner import (  # noqa: F401 — re-export
    DEFAULT_MAX_LIVE_TOKENS,
    run_live_eval,
)
from app.eval.live._output import (  # noqa: F401 — re-export
    main,
    print_live_report,
    write_live_baseline,
)

from app.eval.live import _cases


def __getattr__(name: str):
    # Underscore handler names stay importable from the old flat path.
    if hasattr(_cases, name):
        return getattr(_cases, name)
    raise AttributeError(f'module {__name__!r} has no attribute {name!r}')
