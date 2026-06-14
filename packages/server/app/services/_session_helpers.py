"""Small internal helpers for reading session operations.

Pure functions extracted from reading_session_service to keep the main
module focused on orchestration logic.
"""

from datetime import datetime

from app.models.reading_session import ReadingSession
from app.schemas.reading_session import HeartbeatRequest, SessionUpdate

# Maximum reasonable duration for a single reading session (2 hours).
# Sessions exceeding this are likely idle tabs, not active reading.
MAX_SESSION_SECONDS = 7200


def extract_client_fields(
    data: SessionUpdate | None,
) -> tuple[dict, int | None, float | None, str | None]:
    """Extract client-side fields and remaining update data from SessionUpdate."""
    current_page: int | None = None
    scroll_progress: float | None = None
    current_segment: str | None = None
    if not data:
        return {}, current_page, scroll_progress, current_segment
    update_data = data.model_dump(exclude_unset=True)
    current_page = update_data.pop('current_page', None)
    update_data.pop('total_pages', None)
    scroll_progress = update_data.pop('scroll_progress', None)
    current_segment = update_data.pop('current_segment', None)
    return update_data, current_page, scroll_progress, current_segment


def apply_update_fields(session: ReadingSession, update_data: dict) -> None:
    """Set updateable fields on a session from a dict, skipping is_active."""
    for field, value in update_data.items():
        if field != 'is_active':
            setattr(session, field, value)


def finalize_session_duration(session: ReadingSession, now: datetime) -> None:
    """Compute and set session duration if not already set.

    Prefers client-reported duration (which excludes paused time) over
    wall-clock computation from timestamps. Caps wall-clock fallback
    to avoid inflated durations from idle tabs.
    """
    if not session.duration and session.started_at:
        raw = int((now - session.started_at).total_seconds())
        session.duration = min(raw, MAX_SESSION_SECONDS)


def resolve_heartbeat_pages(body: HeartbeatRequest) -> tuple[int | None, float | None, str | None]:
    """Extract page/scroll/segment fields from heartbeat body.

    Uses `is not None` rather than `or` so an explicit 0 from the client
    (scroll at top of page, no pages read this heartbeat) is preserved
    instead of silently falling back to the camelCase alias.
    """
    pages_read = body.pages_read if body.pages_read is not None else body.pagesRead
    scroll_progress = (
        body.scroll_progress if body.scroll_progress is not None else body.scrollProgress
    )
    current_segment = body.current_segment
    return pages_read, scroll_progress, current_segment
