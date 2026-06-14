"""Collection business logic — CRUD and book management."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.collection import Collection
from app.schemas.collection import CollectionCreate, CollectionUpdate
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.collections')


async def create_collection(
    db: AsyncSession,
    user_id: UUID,
    data: CollectionCreate,
) -> Collection:
    """Create a new collection."""
    now = datetime.now(tz=timezone.utc)
    collection = Collection(
        user_id=user_id,
        name=data.name,
        description=data.description,
        icon=data.icon or 'folder',
        color=data.color or '#f59e0b',
        book_ids=[],
        created_at=now,
        updated_at=now,
    )
    db.add(collection)
    await db.flush()
    await db.refresh(collection)
    logger.info('Collection created: id=%s user=%s name=%s', collection.id, user_id, data.name)
    return collection


async def get_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
) -> Collection | None:
    """Get a collection by ID. Verifies ownership."""
    try:
        async with db_error_guard('get_collection', user_id=str(user_id), collection_id=str(collection_id)):
            result = await db.execute(
                select(Collection).where(
                    Collection.id == collection_id,
                    Collection.user_id == user_id,
                ),
            )
            return result.scalar_one_or_none()
    except DBAPIError:
        logger.warning('collection_service.get_collection failed', exc_info=True)
        return None


async def list_collections(
    db: AsyncSession,
    user_id: UUID,
) -> list[Collection]:
    """List all collections for a user."""
    try:
        async with db_error_guard('list_collections', user_id=str(user_id)):
            result = await db.execute(
                select(Collection)
                .where(Collection.user_id == user_id)
                .order_by(Collection.created_at.desc()),
            )
            return list(result.scalars().all())
    except DBAPIError:
        logger.warning('collection_service.list_collections failed', exc_info=True)
        return []


async def update_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
    data: CollectionUpdate,
) -> Collection:
    """Update a collection. Verifies ownership."""
    try:
        async with db_error_guard('update_collection', user_id=str(user_id), collection_id=str(collection_id)):
            result = await db.execute(
                select(Collection).where(
                    Collection.id == collection_id,
                    Collection.user_id == user_id,
                ),
            )
            collection = result.scalar_one_or_none()
    except DBAPIError as exc:
        logger.warning('collection query failed', exc_info=True)
        raise ValueError('Failed to query collection') from exc

    if collection is None:
        raise ValueError('Collection not found')

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(collection, field, value)

    await db.flush()
    await db.refresh(collection)
    logger.info('Collection updated: id=%s user=%s fields=%s', collection_id, user_id, list(update_data.keys()))
    return collection


async def delete_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
) -> None:
    """Delete a collection. Verifies ownership."""
    try:
        async with db_error_guard('delete_collection', user_id=str(user_id), collection_id=str(collection_id)):
            result = await db.execute(
                select(Collection).where(
                    Collection.id == collection_id,
                    Collection.user_id == user_id,
                ),
            )
            collection = result.scalar_one_or_none()
    except DBAPIError as exc:
        logger.warning('collection query failed', exc_info=True)
        raise ValueError('Failed to query collection') from exc

    if collection is None:
        raise ValueError('Collection not found')

    await db.delete(collection)
    await db.flush()
    logger.info('Collection deleted: id=%s user=%s', collection_id, user_id)


async def _get_owned_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
) -> Collection:
    """Fetch a collection verifying ownership. Raises ValueError if missing."""
    try:
        async with db_error_guard('_get_owned_collection', user_id=str(user_id), collection_id=str(collection_id)):
            result = await db.execute(
                select(Collection).where(
                    Collection.id == collection_id,
                    Collection.user_id == user_id,
                ),
            )
            collection = result.scalar_one_or_none()
    except DBAPIError as exc:
        logger.warning('collection query failed', exc_info=True)
        raise ValueError('Failed to query collection') from exc
    if collection is None:
        raise ValueError('Collection not found')
    return collection


async def _verify_owned_books(
    db: AsyncSession,
    user_id: UUID,
    book_ids: list[UUID],
) -> None:
    """Raise ValueError if any of book_ids is not owned by user_id.

    Prevents collection pollution with arbitrary UUIDs (e.g., other users'
    book IDs or non-existent IDs) which would otherwise be stashed silently.
    """
    if not book_ids:
        return
    unique_ids = list({bid for bid in book_ids if bid is not None})
    if not unique_ids:
        return
    expected = {str(bid) for bid in unique_ids}
    try:
        async with db_error_guard('_verify_owned_books', user_id=str(user_id)):
            result = await db.execute(
                select(Book.id).where(
                    Book.user_id == user_id,
                    Book.id.in_(unique_ids),
                ),
            )
            # Normalize to strings — SQLite TypeDecorator returns strings, PostgreSQL returns UUIDs
            found_ids = {str(row[0]) for row in result.all()}
    except DBAPIError as exc:
        logger.warning('book ownership query failed', exc_info=True)
        raise ValueError('Failed to verify book ownership') from exc
    missing = expected - found_ids
    if missing:
        raise ValueError('Book not found')


async def add_book_to_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
    book_id: UUID,
) -> Collection:
    """Add a book to a collection."""
    collection = await _get_owned_collection(db, user_id, collection_id)
    await _verify_owned_books(db, user_id, [book_id])

    existing_ids = set(collection.book_ids or [])
    existing_ids.add(book_id)
    collection.book_ids = list(existing_ids)

    await db.flush()
    await db.refresh(collection)
    logger.info('Book added to collection: collection=%s user=%s book=%s', collection_id, user_id, book_id)
    return collection


async def add_books_batch(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
    book_ids: list[UUID],
) -> Collection:
    """Add multiple books to a collection in a single DB round-trip."""
    collection = await _get_owned_collection(db, user_id, collection_id)
    await _verify_owned_books(db, user_id, book_ids)

    existing_ids = set(collection.book_ids or [])
    existing_ids.update(book_ids)
    collection.book_ids = list(existing_ids)

    await db.flush()
    await db.refresh(collection)
    logger.info(
        'Books batch-added to collection: collection=%s user=%s count=%d',
        collection_id, user_id, len(book_ids),
    )
    return collection


async def remove_book_from_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
    book_id: UUID,
) -> Collection:
    """Remove a book from a collection."""
    collection = await _get_owned_collection(db, user_id, collection_id)

    existing_ids = set(collection.book_ids or [])
    existing_ids.discard(book_id)
    collection.book_ids = list(existing_ids)

    await db.flush()
    await db.refresh(collection)
    logger.info('Book removed from collection: collection=%s user=%s book=%s', collection_id, user_id, book_id)
    return collection


async def remove_books_batch(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
    book_ids: list[UUID],
) -> Collection:
    """Remove multiple books from a collection in a single DB round-trip."""
    collection = await _get_owned_collection(db, user_id, collection_id)

    existing_ids = set(collection.book_ids or [])
    existing_ids -= set(book_ids)
    collection.book_ids = list(existing_ids)

    await db.flush()
    await db.refresh(collection)
    logger.info(
        'Books batch-removed from collection: collection=%s user=%s count=%d',
        collection_id, user_id, len(book_ids),
    )
    return collection
