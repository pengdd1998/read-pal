"""Book club routes — CRUD, membership, discussions."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.book_club import (
    BookClubCreate,
    BookClubResponse,
    BookClubUpdate,
    ClubJoinRequest,
    DiscussionCreate,
    DiscussionResponse,
    MemberResponse,
)
from app.services import book_club_service
from app.utils.i18n import t

router = APIRouter(prefix='/api/v1/book-clubs', tags=['book-clubs'])


@router.post('', status_code=status.HTTP_201_CREATED)
async def create_club(
    body: BookClubCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a new book club."""
    club = await book_club_service.create_club(db, UUID(user['id']), body)
    return {
        'success': True,
        'data': {
            'id': str(club.id),
            'name': club.name,
            'invite_code': club.invite_code,
        },
    }


@router.get('/discover')
async def discover_clubs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Discover public book clubs."""
    items, total = await book_club_service.discover_clubs(db, page, per_page)
    return {
        'success': True,
        'data': {
            'items': items,
            'total': total,
            'page': page,
            'per_page': per_page,
        },
    }


@router.get('')
async def list_clubs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List clubs the authenticated user belongs to."""
    items, total = await book_club_service.list_clubs(
        db, UUID(user['id']), page, per_page,
    )
    return {
        'success': True,
        'data': {
            'items': items,
            'total': total,
            'page': page,
            'per_page': per_page,
        },
    }


@router.get('/{club_id}')
async def get_club(
    club_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Get club details."""
    club = await book_club_service.get_club(db, club_id)
    if club is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.club_not_found')},
        )
    return {'success': True, 'data': club}


@router.patch('/{club_id}')
async def update_club(
    club_id: UUID,
    body: BookClubUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Update club details. Admin or moderator only."""
    try:
        club = await book_club_service.update_club(
            db, UUID(user['id']), club_id, body,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={'code': 'FORBIDDEN', 'message': str(exc)},
        ) from exc
    return {
        'success': True,
        'data': {
            'id': str(club.id),
            'name': club.name,
            'description': club.description,
            'is_private': club.is_private,
            'max_members': club.max_members,
        },
    }


@router.delete('/{club_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_club(
    club_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> None:
    """Delete a club. Admin only."""
    try:
        await book_club_service.delete_club(db, UUID(user['id']), club_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={'code': 'FORBIDDEN', 'message': str(exc)},
        ) from exc


@router.post('/join')
async def join_club(
    body: ClubJoinRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Join a club by invite code."""
    try:
        club = await book_club_service.join_club(
            db, UUID(user['id']), body.invite_code,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'BAD_REQUEST', 'message': str(exc)},
        ) from exc
    return {
        'success': True,
        'data': {
            'id': str(club.id),
            'name': club.name,
        },
    }


@router.post('/{club_id}/leave')
async def leave_club(
    club_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Leave a club."""
    try:
        await book_club_service.leave_club(db, UUID(user['id']), club_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'BAD_REQUEST', 'message': str(exc)},
        ) from exc
    return {'success': True, 'data': {'message': t('errors.left_club')}}


@router.post('/join-code')
async def join_by_code(
    body: ClubJoinRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Join a club by invite code (alias for /join)."""
    try:
        club = await book_club_service.join_club(
            db, UUID(user['id']), body.invite_code,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'BAD_REQUEST', 'message': str(exc)},
        ) from exc
    return {
        'success': True,
        'data': {
            'id': str(club.id),
            'name': club.name,
        },
    }


@router.get('/{club_id}/members')
async def get_members(
    club_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List club members."""
    members = await book_club_service.get_members(db, club_id)
    return {'success': True, 'data': members}


@router.get('/{club_id}/progress')
async def get_club_progress(
    club_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Get club reading progress."""
    club = await book_club_service.get_club(db, club_id)
    if club is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.club_not_found')},
        )

    members_progress = await book_club_service.get_club_progress(db, club_id)
    avg = 0
    if members_progress:
        avg = round(
            sum(m['progress'] for m in members_progress) / len(members_progress),
        )

    return {
        'success': True,
        'data': {
            'club_id': str(club_id),
            'members_progress': members_progress,
            'average_progress': avg,
        },
    }


@router.get('/{club_id}/discussions')
async def get_discussions(
    club_id: UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List discussions for a club."""
    discussions, total = await book_club_service.get_discussions(
        db, club_id, page, per_page,
    )
    return {
        'success': True,
        'data': {
            'items': [
                {
                    'id': str(d.id),
                    'club_id': str(d.club_id),
                    'user_id': str(d.user_id),
                    'content': d.content,
                    'created_at': d.created_at.isoformat() if d.created_at else None,
                }
                for d in discussions
            ],
            'total': total,
            'page': page,
            'per_page': per_page,
        },
    }


@router.post('/{club_id}/discussions', status_code=status.HTTP_201_CREATED)
async def add_discussion(
    club_id: UUID,
    body: DiscussionCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Add a discussion post to a club."""
    try:
        discussion = await book_club_service.add_discussion(
            db, UUID(user['id']), club_id, body.content,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={'code': 'FORBIDDEN', 'message': str(exc)},
        ) from exc
    return {
        'success': True,
        'data': {
            'id': str(discussion.id),
            'club_id': str(discussion.club_id),
            'user_id': str(discussion.user_id),
            'content': discussion.content,
            'created_at': discussion.created_at.isoformat() if discussion.created_at else None,
        },
    }
