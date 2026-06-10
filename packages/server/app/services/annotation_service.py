"""Business logic for annotation CRUD operations."""

import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.utils.sanitizer import sanitize_annotation_content, strip_html

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.schemas.annotation import AnnotationCreate, AnnotationUpdate

logger = logging.getLogger('read-pal.annotations')


async def get_annotations(
    db: AsyncSession,
    user_id: str,
    book_id: UUID | None = None,
    type: str | None = None,
    page: int = 1,
    per_page: int = 50,
) -> tuple[list[Annotation], int]:
    """Return filtered, paginated annotations."""
    base = select(Annotation).where(Annotation.user_id == user_id)
    count_base = (
        select(func.count())
        .select_from(Annotation)
        .where(Annotation.user_id == user_id)
    )

    if book_id:
        base = base.where(Annotation.book_id == book_id)
        count_base = count_base.where(Annotation.book_id == book_id)

    if type:
        base = base.where(Annotation.type == type)
        count_base = count_base.where(Annotation.type == type)

    total_result = await db.execute(count_base)
    total = total_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        base.order_by(Annotation.created_at.desc())
        .offset(offset)
        .limit(per_page),
    )
    annotations = list(result.scalars().all())

    return annotations, total


async def get_annotation(
    db: AsyncSession,
    user_id: str,
    annotation_id: UUID,
) -> Annotation | None:
    """Return a single annotation, verifying ownership."""
    result = await db.execute(
        select(Annotation).where(
            Annotation.id == annotation_id,
            Annotation.user_id == user_id,
        ),
    )
    return result.scalar_one_or_none()


async def create_annotation(
    db: AsyncSession,
    user_id: UUID,
    data: AnnotationCreate,
) -> Annotation:
    """Create a new annotation."""
    # M5: Validate book exists and belongs to user
    book_result = await db.execute(
        select(Book).where(Book.id == data.book_id, Book.user_id == user_id),
    )
    if book_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'Book not found'},
        )

    annotation = Annotation(
        user_id=user_id,
        book_id=data.book_id,
        type=data.type,
        location=data.location,
        content=sanitize_annotation_content(data.content),
        color=data.color,
        note=strip_html(data.note) if data.note else None,
        tags=[strip_html(t) for t in (data.tags or [])],
    )
    db.add(annotation)
    await db.flush()
    await db.refresh(annotation)

    logger.info(
        'Annotation created: %s (%s) for user %s',
        annotation.type,
        annotation.id,
        user_id,
    )
    return annotation


async def update_annotation(
    db: AsyncSession,
    user_id: str,
    annotation_id: UUID,
    data: AnnotationUpdate,
) -> Annotation | None:
    """Partially update an annotation."""
    annotation = await get_annotation(db, user_id, annotation_id)
    if annotation is None:
        return None

    update_data = data.model_dump(exclude_unset=True)

    # Sanitize text fields to prevent stored XSS
    if 'content' in update_data:
        update_data['content'] = sanitize_annotation_content(update_data['content'])
    if 'note' in update_data and update_data['note']:
        update_data['note'] = strip_html(update_data['note'])
    if 'tags' in update_data and update_data['tags']:
        update_data['tags'] = [strip_html(t) for t in update_data['tags']]

    for field, value in update_data.items():
        setattr(annotation, field, value)

    await db.flush()

    logger.info('Annotation updated: %s for user %s', annotation_id, user_id)
    return annotation


async def delete_annotation(
    db: AsyncSession,
    user_id: str,
    annotation_id: UUID,
) -> bool:
    """Delete an annotation."""
    annotation = await get_annotation(db, user_id, annotation_id)
    if annotation is None:
        return False

    await db.delete(annotation)
    await db.flush()

    logger.info('Annotation deleted: %s for user %s', annotation_id, user_id)
    return True


async def search_annotations(
    db: AsyncSession,
    user_id: str,
    query: str,
    book_id: UUID | None = None,
) -> list[Annotation]:
    """Full-text search on annotation content and note fields."""
    pattern = f'%{query}%'
    base = select(Annotation).where(
        Annotation.user_id == user_id,
        or_(
            Annotation.content.ilike(pattern),
            Annotation.note.ilike(pattern),
        ),
    )

    if book_id:
        base = base.where(Annotation.book_id == book_id)

    result = await db.execute(base.order_by(Annotation.created_at.desc()).limit(50))
    return list(result.scalars().all())


async def get_chapter_stats(
    db: AsyncSession,
    user_id: str,
    book_id: UUID,
) -> list[dict]:
    """Group annotations by chapter from location JSONB, with type counts."""
    result = await db.execute(
        select(Annotation).where(
            Annotation.user_id == user_id,
            Annotation.book_id == book_id,
        ).order_by(Annotation.created_at.asc()),
    )
    annotations = list(result.scalars().all())

    chapters: dict[str, dict] = {}
    for ann in annotations:
        chapter_name = ann.location.get('chapter', 'Unknown')
        if chapter_name not in chapters:
            chapters[chapter_name] = {
                'chapter': chapter_name,
                'count': 0,
                'types': {'highlight': 0, 'note': 0, 'bookmark': 0},
            }
        chapters[chapter_name]['count'] += 1
        ann_type = ann.type if ann.type in chapters[chapter_name]['types'] else 'highlight'
        chapters[chapter_name]['types'][ann_type] += 1

    return list(chapters.values())
