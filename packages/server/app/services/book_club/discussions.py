"""Book club discussion operations — add and list discussions."""

import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book_club import BookClubMember, ClubDiscussion
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.book_clubs')


async def add_discussion(
    db: AsyncSession,
    user_id: UUID,
    club_id: UUID,
    content: str,
) -> ClubDiscussion:
    """Add a discussion post. User must be a member."""
    async with db_error_guard('add_discussion', user_id=str(user_id), club_id=str(club_id)):
        member_result = await db.execute(
            select(BookClubMember).where(
                BookClubMember.club_id == club_id,
                BookClubMember.user_id == user_id,
            ),
        )
        if member_result.scalar_one_or_none() is None:
            raise PermissionError('Must be a member to post discussions')

        discussion = ClubDiscussion(
            club_id=club_id,
            user_id=user_id,
            content=content,
        )
        db.add(discussion)
        await db.flush()
        await db.refresh(discussion)
    logger.info('Discussion added: id=%s club=%s user=%s', discussion.id, club_id, user_id)
    return discussion


async def get_discussions(
    db: AsyncSession,
    club_id: UUID,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[ClubDiscussion], int]:
    """List discussions for a club, newest first."""
    async with db_error_guard('get_discussions', club_id=str(club_id)):
        count_result = await db.execute(
            select(func.count())
            .select_from(ClubDiscussion)
            .where(ClubDiscussion.club_id == club_id),
        )
        total = count_result.scalar() or 0

        offset = (page - 1) * per_page
        result = await db.execute(
            select(ClubDiscussion)
            .where(ClubDiscussion.club_id == club_id)
            .order_by(ClubDiscussion.created_at.desc())
            .offset(offset)
            .limit(per_page),
        )
        discussions = result.scalars().all()
    return list(discussions), total
