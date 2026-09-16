"""Reading-session package — the single public API surface.

Consumers import from here (``from app.services.reading_session import
get_sessions``); the sub-modules (``_service``/``_queries``/...) are
internal layout, free to change without touching call sites.
"""

from app.services.reading_session._book_progress import (  # noqa: F401
    cap_progress,
    notify_book_completed,
    update_book_completion,
)
from app.services.reading_session._queries import (  # noqa: F401
    get_active_session,
    get_book_session_log,
    get_session,
    get_sessions,
)
from app.services.reading_session._stats import get_session_stats  # noqa: F401
from app.services.reading_session._summary import build_session_summary  # noqa: F401

# Facade business logic (create/update/close/stale sweep). Star import
# picks up the public defs; underscore names tests rely on are imported
# explicitly below.
from app.services.reading_session._service import *  # noqa: F401,F403
from app.services.reading_session._service import _close_stale_sessions  # noqa: F401
