"""Business logic for annotation CRUD operations."""

import logging
from uuid import UUID

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
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

    try:
        total_result = await db.execute(count_base)
        total = total_result.scalar() or 0

        offset = (page - 1) * per_page
        result = await db.execute(
            base.order_by(Annotation.created_at.desc())
            .offset(offset)
            .limit(per_page),
        )
        annotations = list(result.scalars().all())
    except Exception as exc:
        logger.error('get_annotations failed: %s', exc)
        raise

    return annotations, total


async def get_annotation(
    db: AsyncSession,
    user_id: str,
    annotation_id: UUID,
) -> Annotation | None:
    """Return a single annotation, verifying ownership."""
    try:
        result = await db.execute(
            select(Annotation).where(
                Annotation.id == annotation_id,
                Annotation.user_id == user_id,
            ),
        )
        return result.scalar_one_or_none()
    except Exception as exc:
        logger.error('get_annotation failed: %s', exc)
        raise


async def create_annotation(
    db: AsyncSession,
    user_id: str,
    data: AnnotationCreate,
) -> Annotation:
    """Create a new annotation after verifying book ownership."""
    try:
        book = await db.scalar(
            select(Book).where(Book.id == data.book_id, Book.user_id == user_id),
        )
        if book is None:
            raise ValueError('Book not found')

        annotation = Annotation(
            user_id=user_id,
            book_id=data.book_id,
            type=data.type,
            location=data.location,
            content=data.content,
            color=data.color,
            note=data.note,
            tags=data.tags if data.tags else [],
        )
        db.add(annotation)
        await db.flush()
        await db.refresh(annotation)
    except Exception as exc:
        logger.error('create_annotation failed: %s', exc)
        raise

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

    try:
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(annotation, field, value)

        await db.flush()
    except Exception as exc:
        logger.error('update_annotation failed: %s', exc)
        raise

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

    try:
        await db.delete(annotation)
        await db.flush()
    except Exception as exc:
        logger.error('delete_annotation failed: %s', exc)
        raise

    logger.info('Annotation deleted: %s for user %s', annotation_id, user_id)
    return True


async def get_tags(
    db: AsyncSession,
    user_id: str,
    book_id: UUID | None = None,
) -> list[dict]:
    """Get tags with counts for a user's annotations, optionally filtered by book."""
    tag_col = func.unnest(Annotation.tags).label('tag')
    q = (
        select(
            tag_col,
            func.count().label('count'),
        )
        .where(Annotation.user_id == user_id, Annotation.tags != None)  # noqa: E711
        .group_by(tag_col)
        .order_by(func.count().desc())
    )
    if book_id:
        q = q.where(Annotation.book_id == book_id)
    try:
        result = await db.execute(q)
        rows = result.all()
    except Exception as exc:
        logger.error('get_tags failed: %s', exc)
        raise
    tags = []
    for row in rows:
        name = row[0]
        if name:
            tags.append({'name': name, 'count': row[1]})
    return tags


async def search_annotations(
    db: AsyncSession,
    user_id: str,
    query: str,
    book_id: UUID | None = None,
) -> list[Annotation]:
    """Full-text search on annotation content and note fields."""
    escaped = query.replace('%', r'\%').replace('_', r'\_')
    pattern = f'%{escaped}%'
    base = select(Annotation).where(
        Annotation.user_id == user_id,
        or_(
            Annotation.content.ilike(pattern),
            Annotation.note.ilike(pattern),
        ),
    )

    if book_id:
        base = base.where(Annotation.book_id == book_id)

    try:
        result = await db.execute(
            base.order_by(Annotation.created_at.desc()).limit(50),
        )
        return list(result.scalars().all())
    except Exception as exc:
        logger.error('search_annotations failed: %s', exc)
        raise


async def get_chapter_stats(
    db: AsyncSession,
    user_id: str,
    book_id: UUID,
) -> list[dict]:
    """Group annotations by chapter from location JSONB, with type counts."""
    chapter_col = func.coalesce(
        cast(Annotation.location['chapter'], String), 'Unknown',
    ).label('chapter')
    try:
        result = await db.execute(
            select(
                chapter_col,
                Annotation.type,
                func.count(Annotation.id).label('count'),
            ).where(
                Annotation.user_id == user_id,
                Annotation.book_id == book_id,
            ).group_by(
                chapter_col,
                Annotation.type,
            ),
        )
    except Exception as exc:
        logger.error('get_chapter_stats failed: %s', exc)
        raise

    chapters: dict[str, dict] = {}
    for row in result.all():
        chapter_name = row.chapter or 'Unknown'
        if chapter_name not in chapters:
            chapters[chapter_name] = {
                'chapter': chapter_name,
                'count': 0,
                'types': {'highlight': 0, 'note': 0, 'bookmark': 0},
            }
        chapters[chapter_name]['count'] += row.count
        ann_type = row.type if row.type in chapters[chapter_name]['types'] else 'highlight'
        chapters[chapter_name]['types'][ann_type] += row.count

    return list(chapters.values())
