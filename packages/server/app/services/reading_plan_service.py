"""Backward-compatible shim — delegates to reading_plan sub-package."""

from app.services.reading_plan.reading_plan_service import (  # noqa: F401
    advance_plan,
    generate_plan,
    get_active_plan,
)
