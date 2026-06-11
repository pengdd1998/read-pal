"""Collection business logic — CRUD and book management."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

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
    collection = Collection(
        user_id=user_id,
        name=data.name,
        description=data.description,
        icon=data.icon or 'folder',
        color=data.color or '#f59e0b',
        book_ids=[],
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
    except DBAPIError:
        raise ValueError('Failed to query collection') from None

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
    except DBAPIError:
        raise ValueError('Failed to query collection') from None

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
    except DBAPIError:
        raise ValueError('Failed to query collection') from None
    if collection is None:
        raise ValueError('Collection not found')
    return collection


async def add_book_to_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
    book_id: UUID,
) -> Collection:
    """Add a book to a collection."""
    collection = await _get_owned_collection(db, user_id, collection_id)

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
