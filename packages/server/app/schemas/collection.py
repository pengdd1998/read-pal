"""Pydantic v2 schemas for collection endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CollectionCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, max_length=20)


class CollectionUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, max_length=20)
    book_ids: list[UUID] | None = None


class CollectionResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    user_id: UUID
    name: str
    description: str | None
    icon: str
    color: str
    book_ids: list[UUID]
    created_at: datetime
    updated_at: datetime


class CollectionListResponse(BaseModel):
    """Paginated collection list. `data` stays the items array so existing
    frontend consumers reading `res.data.items` keep working."""

    success: bool = True
    data: list[CollectionResponse]
    total: int
    page: int = 1
    per_page: int = Field(20, alias='perPage')
    has_more: bool = Field(False, alias='hasMore')

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class CollectionBooksBatchRequest(BaseModel):
    """Request body for batch adding/removing books from a collection."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_ids: list[str] = Field(default=[], max_length=100, alias='bookIds')
