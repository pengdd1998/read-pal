"""Book club CRUD operations — create, read, update, delete."""

import logging
import secrets
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book_club import BookClub, BookClubMember
from app.schemas.book_club import BookClubCreate, BookClubUpdate
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.book_clubs')


async def create_club(
    db: AsyncSession,
    user_id: UUID,
    data: BookClubCreate,
) -> BookClub:
    """Create a new book club and add the creator as admin member."""
    async with db_error_guard('create_club', user_id=str(user_id)):
        invite_code = secrets.token_urlsafe(4)[:6].upper()
        club = BookClub(
            name=data.name,
            description=data.description,
            cover_image=data.cover_image,
            created_by=user_id,
            is_private=data.is_private,
            max_members=data.max_members,
            invite_code=invite_code,
        )
        db.add(club)
        await db.flush()

        member = BookClubMember(
            club_id=club.id,
            user_id=user_id,
            role='admin',
        )
        db.add(member)
        await db.flush()
        await db.refresh(club)

    logger.info('Club created: %s (%s)', club.name, club.id)
    return club


async def get_club(db: AsyncSession, club_id: UUID) -> dict | None:
    """Get club details with computed member count."""
    async with db_error_guard('get_club', club_id=str(club_id)):
        result = await db.execute(
            select(BookClub).where(BookClub.id == club_id),
        )
        club = result.scalar_one_or_none()
        if club is None:
            return None

        count_result = await db.execute(
            select(func.count())
            .select_from(BookClubMember)
            .where(BookClubMember.club_id == club_id),
        )
        member_count = count_result.scalar() or 0

    return {
        'id': str(club.id),
        'name': club.name,
        'description': club.description,
        'coverImage': club.cover_image,
        'createdBy': str(club.created_by),
        'currentBookId': str(club.current_book_id) if club.current_book_id else None,
        'isPrivate': club.is_private,
        'inviteCode': club.invite_code,
        'maxMembers': club.max_members,
        'memberCount': member_count,
        'createdAt': club.created_at.isoformat() if club.created_at else None,
        'updatedAt': club.updated_at.isoformat() if club.updated_at else None,
    }


async def list_clubs(
    db: AsyncSession,
    user_id: UUID,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[dict], int]:
    """List clubs the user belongs to, with member counts."""
    async with db_error_guard('list_clubs', user_id=str(user_id)):
        count_q = (
            select(func.count())
            .select_from(BookClubMember)
            .where(BookClubMember.user_id == user_id)
        )
        total = (await db.execute(count_q)).scalar() or 0

        offset = (page - 1) * per_page
        member_count_sq = (
            select(BookClubMember.club_id, func.count().label('mc'))
            .group_by(BookClubMember.club_id)
            .subquery()
        )
        result = await db.execute(
            select(BookClub, func.coalesce(member_count_sq.c.mc, 0))
            .join(BookClubMember, BookClubMember.club_id == BookClub.id)
            .outerjoin(member_count_sq, member_count_sq.c.club_id == BookClub.id)
            .where(BookClubMember.user_id == user_id)
            .order_by(BookClub.created_at.desc())
            .offset(offset)
            .limit(per_page),
        )
        rows = result.all()

    items = []
    for club, mc in rows:
        items.append({
            'id': str(club.id),
            'name': club.name,
            'description': club.description,
            'coverImage': club.cover_image,
            'createdBy': str(club.created_by),
            'currentBookId': str(club.current_book_id) if club.current_book_id else None,
            'isPrivate': club.is_private,
            'inviteCode': club.invite_code,
            'maxMembers': club.max_members,
            'memberCount': mc,
            'createdAt': club.created_at.isoformat() if club.created_at else None,
            'updatedAt': club.updated_at.isoformat() if club.updated_at else None,
        })

    return items, total


async def update_club(
    db: AsyncSession,
    user_id: UUID,
    club_id: UUID,
    data: BookClubUpdate,
) -> BookClub:
    """Update club details. Only admin or moderator can update."""
    async with db_error_guard('update_club', club_id=str(club_id)):
        result = await db.execute(
            select(BookClub).where(BookClub.id == club_id),
        )
        club = result.scalar_one_or_none()
        if club is None:
            raise ValueError('Club not found')

        member_result = await db.execute(
            select(BookClubMember).where(
                BookClubMember.club_id == club_id,
                BookClubMember.user_id == user_id,
            ),
        )
        member = member_result.scalar_one_or_none()
        if member is None or member.role not in ('admin', 'moderator'):
            raise ValueError('Only admin or moderator can update the club')

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(club, field, value)

        await db.flush()
        await db.refresh(club)

    logger.info('Club updated: id=%s user=%s fields=%s', club_id, user_id, list(update_data.keys()))
    return club


async def delete_club(
    db: AsyncSession,
    user_id: UUID,
    club_id: UUID,
) -> None:
    """Delete a club. Only admin can delete."""
    async with db_error_guard('delete_club', club_id=str(club_id)):
        result = await db.execute(
            select(BookClub).where(BookClub.id == club_id),
        )
        club = result.scalar_one_or_none()
        if club is None:
            raise ValueError('Club not found')

        member_result = await db.execute(
            select(BookClubMember).where(
                BookClubMember.club_id == club_id,
                BookClubMember.user_id == user_id,
                BookClubMember.role == 'admin',
            ),
        )
        if member_result.scalar_one_or_none() is None:
            raise ValueError('Only admin can delete the club')

        await db.delete(club)
        await db.flush()

    logger.info('Club deleted: %s (%s)', club.name, club.id)
