"""Book club business logic — re-exports for backward compatibility."""

from app.services.book_club.crud import (
    create_club,
    delete_club,
    get_club,
    list_clubs,
    update_club,
)
from app.services.book_club.discussions import (
    add_discussion,
    get_discussions,
)
from app.services.book_club.members import (
    get_members,
    join_club,
    leave_club,
)
from app.services.book_club.progress import (
    discover_clubs,
    get_club_progress,
)

__all__ = [
    'add_discussion',
    'create_club',
    'delete_club',
    'discover_clubs',
    'get_club',
    'get_club_progress',
    'get_discussions',
    'get_members',
    'join_club',
    'leave_club',
    'list_clubs',
    'update_club',
]
