"""Book club discovery and reading progress tracking."""

import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.book_club import BookClub, BookClubMember
from app.models.user import User

logger = logging.getLogger('read-pal.book_clubs')


async def discover_clubs(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[dict], int]:
    """Discover public clubs ordered by member count (most popular first)."""
    count_result = await db.execute(
        select(func.count())
        .select_from(BookClub)
        .where(BookClub.is_private == False),  # noqa: E712
    )
    total = count_result.scalar() or 0

    member_count_sq = (
        select(BookClubMember.club_id, func.count().label('mc'))
        .group_by(BookClubMember.club_id)
        .subquery()
    )
    offset = (page - 1) * per_page
    result = await db.execute(
        select(BookClub, func.coalesce(member_count_sq.c.mc, 0))
        .outerjoin(member_count_sq, member_count_sq.c.club_id == BookClub.id)
        .where(BookClub.is_private == False)  # noqa: E712
        .order_by(BookClub.created_at.desc())
        .offset(offset)
        .limit(per_page),
    )
    rows = result.all()

    # Collect book titles in one batch
    book_ids = [club.current_book_id for club, _ in rows if club.current_book_id]
    book_titles: dict = {}
    if book_ids:
        book_result = await db.execute(
            select(Book.id, Book.title).where(Book.id.in_(book_ids)),
        )
        book_titles = dict(book_result.all())

    items = []
    for club, mc in rows:
        items.append({
            'id': str(club.id),
            'name': club.name,
            'description': club.description,
            'coverImage': club.cover_image,
            'isPrivate': club.is_private,
            'maxMembers': club.max_members,
            'memberCount': mc,
            'currentBookTitle': book_titles.get(club.current_book_id) if club.current_book_id else None,
            'createdAt': club.created_at.isoformat() if club.created_at else None,
        })

    return items, total


async def get_club_progress(
    db: AsyncSession,
    club_id: UUID,
) -> dict:
    """Get reading progress for each member of a club with average.

    Returns dict with 'members_progress' list and 'average_progress' int.
    """
    club = (
        await db.execute(select(BookClub).where(BookClub.id == club_id))
    ).scalar_one_or_none()
    if club is None:
        return {'membersProgress': [], 'averageProgress': 0}

    # Get all members
    member_rows = (
        await db.execute(
            select(BookClubMember, User.name)
            .join(User, User.id == BookClubMember.user_id)
            .where(BookClubMember.club_id == club_id),
        )
    ).all()

    # Batch-fetch books for all members in a single query (avoids N+1)
    book_by_user: dict = {}
    if club.current_book_id and member_rows:
        user_ids = [member.user_id for member, _ in member_rows]
        book_result = await db.execute(
            select(Book).where(
                Book.id == club.current_book_id,
                Book.user_id.in_(user_ids),
            ),
        )
        book_by_user = {b.user_id: b for b in book_result.scalars().all()}

    progress_list = []
    for member, user_name in member_rows:
        member_progress = 0
        book = book_by_user.get(member.user_id)
        if book and book.total_pages and book.total_pages > 0:
            member_progress = round(
                (book.current_page or 0) / book.total_pages * 100,
            )

        progress_list.append({
            'userId': str(member.user_id),
            'userName': user_name,
            'progress': member_progress,
        })

    avg = 0
    if progress_list:
        avg = round(
            sum(m['progress'] for m in progress_list) / len(progress_list),
        )

    return {
        'membersProgress': progress_list,
        'averageProgress': avg,
    }
