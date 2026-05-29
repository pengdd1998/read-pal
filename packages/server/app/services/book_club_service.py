"""Backward-compatibility shim — all exports moved to app.services.book_club package."""

from app.services.book_club import (  # noqa: F401
    add_discussion,
    create_club,
    delete_club,
    discover_clubs,
    get_club,
    get_club_progress,
    get_discussions,
    get_members,
    join_club,
    leave_club,
    list_clubs,
    update_club,
)
