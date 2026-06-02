"""Book club membership operations — join, leave, list members."""

import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book_club import BookClubMember
from app.models.user import User

logger = logging.getLogger('read-pal.book_clubs')


async def join_club(
    db: AsyncSession,
    user_id: UUID,
    invite_code: str,
) -> 'BookClub':
    """Join a club by invite code. Validates capacity and membership."""
    from app.models.book_club import BookClub

    result = await db.execute(
        select(BookClub).where(BookClub.invite_code == invite_code),
    )
    club = result.scalar_one_or_none()
    if club is None:
        raise ValueError('Invalid invite code')

    existing = await db.execute(
        select(BookClubMember).where(
            BookClubMember.club_id == club.id,
            BookClubMember.user_id == user_id,
        ),
    )
    if existing.scalar_one_or_none() is not None:
        raise ValueError('Already a member of this club')

    count_result = await db.execute(
        select(func.count())
        .select_from(BookClubMember)
        .where(BookClubMember.club_id == club.id),
    )
    if (count_result.scalar() or 0) >= club.max_members:
        raise ValueError('Club is full')

    member = BookClubMember(
        club_id=club.id,
        user_id=user_id,
        role='member',
    )
    db.add(member)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ValueError('Already a member of this club') from None

    logger.info('User %s joined club %s', user_id, club.id)
    return club


async def leave_club(
    db: AsyncSession,
    user_id: UUID,
    club_id: UUID,
) -> None:
    """Leave a club. Admin cannot leave if they are the last admin."""
    result = await db.execute(
        select(BookClubMember).where(
            BookClubMember.club_id == club_id,
            BookClubMember.user_id == user_id,
        ),
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise ValueError('Not a member of this club')

    if member.role == 'admin':
        admin_count = (
            await db.execute(
                select(func.count())
                .select_from(BookClubMember)
                .where(
                    BookClubMember.club_id == club_id,
                    BookClubMember.role == 'admin',
                ),
            )
        ).scalar() or 0
        if admin_count <= 1:
            raise ValueError('Cannot leave — you are the last admin. Delete the club instead.')

    await db.delete(member)
    await db.flush()
    logger.info('User left club: user=%s club=%s', user_id, club_id)


async def get_members(
    db: AsyncSession,
    club_id: UUID,
) -> list[dict]:
    """List club members with user names."""
    result = await db.execute(
        select(BookClubMember, User.name)
        .join(User, User.id == BookClubMember.user_id)
        .where(BookClubMember.club_id == club_id)
        .order_by(BookClubMember.joined_at.asc()),
    )
    rows = result.all()
    return [
        {
            'id': str(member.id),
            'club_id': str(member.club_id),
            'user_id': str(member.user_id),
            'role': member.role,
            'joined_at': member.joined_at.isoformat() if member.joined_at else None,
            'user_name': user_name,
        }
        for member, user_name in rows
    ]
