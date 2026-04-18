"""Collection business logic — CRUD and book management."""

import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import Collection
from app.schemas.collection import CollectionCreate, CollectionUpdate

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
    return collection


async def get_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
) -> Collection | None:
    """Get a collection by ID. Verifies ownership."""
    result = await db.execute(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.user_id == user_id,
        ),
    )
    return result.scalar_one_or_none()


async def list_collections(
    db: AsyncSession,
    user_id: UUID,
) -> list[Collection]:
    """List all collections for a user."""
    result = await db.execute(
        select(Collection)
        .where(Collection.user_id == user_id)
        .order_by(Collection.created_at.desc()),
    )
    return list(result.scalars().all())


async def update_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
    data: CollectionUpdate,
) -> Collection:
    """Update a collection. Verifies ownership."""
    result = await db.execute(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.user_id == user_id,
        ),
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise ValueError('Collection not found')

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(collection, field, value)

    await db.flush()
    await db.refresh(collection)
    return collection


async def delete_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
) -> None:
    """Delete a collection. Verifies ownership."""
    result = await db.execute(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.user_id == user_id,
        ),
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise ValueError('Collection not found')

    await db.delete(collection)
    await db.flush()


async def add_book_to_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
    book_id: UUID,
) -> Collection:
    """Add a book to a collection."""
    result = await db.execute(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.user_id == user_id,
        ),
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise ValueError('Collection not found')

    existing_ids = set(collection.book_ids or [])
    existing_ids.add(book_id)
    collection.book_ids = list(existing_ids)

    await db.flush()
    await db.refresh(collection)
    return collection


async def remove_book_from_collection(
    db: AsyncSession,
    user_id: UUID,
    collection_id: UUID,
    book_id: UUID,
) -> Collection:
    """Remove a book from a collection."""
    result = await db.execute(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.user_id == user_id,
        ),
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise ValueError('Collection not found')

    existing_ids = set(collection.book_ids or [])
    existing_ids.discard(book_id)
    collection.book_ids = list(existing_ids)

    await db.flush()
    await db.refresh(collection)
    return collection
