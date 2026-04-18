"""Pydantic v2 schemas for notification endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: UUID
    user_id: UUID
    type: str
    title: str
    message: str
    metadata_: dict | None = None
    read: bool
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}


class NotificationUpdate(BaseModel):
    read: bool
