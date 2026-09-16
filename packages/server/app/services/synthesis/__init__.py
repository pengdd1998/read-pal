"""Synthesis sub-package — data loaders for single-book synthesis."""

from app.services.synthesis.data_loaders import collect_reading_data

__all__ = ['collect_reading_data']

from app.services.synthesis.api import (  # noqa: F401,E402
    _build_synthesis_prompt,
    _log_synthesis_result,
    synthesize,
)
