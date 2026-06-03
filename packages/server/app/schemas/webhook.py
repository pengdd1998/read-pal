"""Pydantic v2 schemas for webhook endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, HttpUrl
from pydantic.alias_generators import to_camel

from app.models.webhook import VALID_WEBHOOK_EVENTS


def _validate_events(events: list[str]) -> list[str]:
    """Ensure all events are in the valid set."""
    invalid = [e for e in events if e not in VALID_WEBHOOK_EVENTS]
    if invalid:
        raise ValueError(f'Invalid events: {invalid}. Valid: {VALID_WEBHOOK_EVENTS}')
    return events


class WebhookCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    url: HttpUrl
    events: list[str]
    secret: str | None = None

    def model_post_init(self, __context: object) -> None:
        _validate_events(self.events)


class WebhookUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    url: HttpUrl | None = None
    events: list[str] | None = None
    is_active: bool | None = None

    def model_post_init(self, __context: object) -> None:
        if self.events is not None:
            _validate_events(self.events)


class WebhookResponse(BaseModel):
    """Single webhook returned in create / update / test responses."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    url: str
    events: list[str]
    secret: str
    is_active: bool
    created_at: datetime


class WebhookListItemResponse(BaseModel):
    """Webhook item in the list endpoint (includes delivery summary)."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    url: str
    events: list[str]
    is_active: bool
    last_delivery_at: datetime | None
    last_delivery_status: int | None
    failure_count: int
    created_at: datetime


class DeliveryLogResponse(BaseModel):
    """Single delivery log entry."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    webhook_id: UUID
    event: str
    url: str
    status_code: int | None
    duration_ms: int
    error: str | None
    created_at: datetime


class WebhookTestResponse(BaseModel):
    """Response for the test-webhook endpoint."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    url: str
    test_result: str
