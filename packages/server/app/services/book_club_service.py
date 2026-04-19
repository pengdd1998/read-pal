"""Book club business logic — CRUD, membership, discussions."""

import logging
import secrets
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.book_club import BookClub, BookClubMember, ClubDiscussion
from app.models.user import User
from app.schemas.book_club import BookClubCreate, BookClubUpdate
from app.utils.exceptions import ForbiddenError

logger = logging.getLogger('read-pal.book_clubs')


async def create_club(
    db: AsyncSession,
    user_id: UUID,
    data: BookClubCreate,
) -> BookClub:
    """Create a new book club and add the creator as admin member."""
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
        'cover_image': club.cover_image,
        'created_by': str(club.created_by),
        'current_book_id': str(club.current_book_id) if club.current_book_id else None,
        'is_private': club.is_private,
        'invite_code': club.invite_code,
        'max_members': club.max_members,
        'member_count': member_count,
        'created_at': club.created_at.isoformat() if club.created_at else None,
        'updated_at': club.updated_at.isoformat() if club.updated_at else None,
    }


async def list_clubs(
    db: AsyncSession,
    user_id: UUID,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[dict], int]:
    """List clubs the user belongs to, with member counts."""
    # Count total
    count_q = (
        select(func.count())
        .select_from(BookClubMember)
        .where(BookClubMember.user_id == user_id)
    )
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch clubs with member count in a single query (avoid N+1)
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
            'cover_image': club.cover_image,
            'created_by': str(club.created_by),
            'current_book_id': str(club.current_book_id) if club.current_book_id else None,
            'is_private': club.is_private,
            'invite_code': club.invite_code,
            'max_members': club.max_members,
            'member_count': mc,
            'created_at': club.created_at.isoformat() if club.created_at else None,
            'updated_at': club.updated_at.isoformat() if club.updated_at else None,
        })

    return items, total


async def join_club(
    db: AsyncSession,
    user_id: UUID,
    invite_code: str,
) -> BookClub:
    """Join a club by invite code. Validates capacity and membership."""
    result = await db.execute(
        select(BookClub).where(BookClub.invite_code == invite_code),
    )
    club = result.scalar_one_or_none()
    if club is None:
        raise ValueError('Invalid invite code')

    # Check already a member
    existing = await db.execute(
        select(BookClubMember).where(
            BookClubMember.club_id == club.id,
            BookClubMember.user_id == user_id,
        ),
    )
    if existing.scalar_one_or_none() is not None:
        raise ValueError('Already a member of this club')

    # Check capacity
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
    await db.flush()

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


async def update_club(
    db: AsyncSession,
    user_id: UUID,
    club_id: UUID,
    data: BookClubUpdate,
) -> BookClub:
    """Update club details. Only admin or moderator can update."""
    result = await db.execute(
        select(BookClub).where(BookClub.id == club_id),
    )
    club = result.scalar_one_or_none()
    if club is None:
        raise ValueError('Club not found')

    # Check role
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
        if field == 'current_book_id' and value is not None:
            setattr(club, field, value)
        else:
            setattr(club, field, value)

    await db.flush()
    await db.refresh(club)
    return club


async def delete_club(
    db: AsyncSession,
    user_id: UUID,
    club_id: UUID,
) -> None:
    """Delete a club. Only admin can delete."""
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


async def add_discussion(
    db: AsyncSession,
    user_id: UUID,
    club_id: UUID,
    content: str,
) -> ClubDiscussion:
    """Add a discussion post. User must be a member."""
    # Verify membership
    member_result = await db.execute(
        select(BookClubMember).where(
            BookClubMember.club_id == club_id,
            BookClubMember.user_id == user_id,
        ),
    )
    if member_result.scalar_one_or_none() is None:
        raise ValueError('Must be a member to post discussions')

    discussion = ClubDiscussion(
        club_id=club_id,
        user_id=user_id,
        content=content,
    )
    db.add(discussion)
    await db.flush()
    await db.refresh(discussion)
    return discussion


async def get_discussions(
    db: AsyncSession,
    club_id: UUID,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[ClubDiscussion], int]:
    """List discussions for a club, newest first."""
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


async def discover_clubs(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[dict], int]:
    """Discover public clubs ordered by member count (most popular first)."""
    from app.models.book import Book

    count_result = await db.execute(
        select(func.count())
        .select_from(BookClub)
        .where(BookClub.is_private == False),  # noqa: E712
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        select(BookClub)
        .where(BookClub.is_private == False)  # noqa: E712
        .order_by(BookClub.created_at.desc())
        .offset(offset)
        .limit(per_page),
    )
    clubs = result.scalars().all()

    items = []
    for club in clubs:
        mc = (
            await db.execute(
                select(func.count())
                .select_from(BookClubMember)
                .where(BookClubMember.club_id == club.id),
            )
        ).scalar() or 0

        current_book_title = None
        if club.current_book_id:
            book_result = await db.execute(
                select(Book.title).where(Book.id == club.current_book_id),
            )
            current_book_title = book_result.scalar()

        items.append({
            'id': str(club.id),
            'name': club.name,
            'description': club.description,
            'cover_image': club.cover_image,
            'is_private': club.is_private,
            'max_members': club.max_members,
            'member_count': mc,
            'current_book_title': current_book_title,
            'created_at': club.created_at.isoformat() if club.created_at else None,
        })

    return items, total


async def get_club_progress(
    db: AsyncSession,
    club_id: UUID,
) -> list[dict]:
    """Get reading progress for each member of a club."""
    from app.models.book import Book

    club = (
        await db.execute(select(BookClub).where(BookClub.id == club_id))
    ).scalar_one_or_none()
    if club is None:
        return []

    # Get all members
    member_rows = (
        await db.execute(
            select(BookClubMember, User.name)
            .join(User, User.id == BookClubMember.user_id)
            .where(BookClubMember.club_id == club_id),
        )
    ).all()

    progress_list = []
    for member, user_name in member_rows:
        member_progress = 0
        if club.current_book_id:
            book_result = await db.execute(
                select(Book).where(
                    Book.id == club.current_book_id,
                    Book.user_id == member.user_id,
                ),
            )
            book = book_result.scalar_one_or_none()
            if book and book.total_pages and book.total_pages > 0:
                member_progress = round(
                    (book.current_page or 0) / book.total_pages * 100,
                )

        progress_list.append({
            'user_id': str(member.user_id),
            'user_name': user_name,
            'progress': member_progress,
        })

    return progress_list
