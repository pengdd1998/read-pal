"""Settings schemas."""

from pydantic import BaseModel, ConfigDict, Field


class SettingsUpdate(BaseModel):
    """Schema for updating user settings.

    Uses extra='allow' because settings is a JSONB blob —
    arbitrary keys (companionMode, zoteroApiKey, etc.) must pass through.
    Field names match the JSONB keys stored in the database.
    """

    model_config = ConfigDict(extra='allow')

    theme: str | None = Field(None, pattern=r'^(light|dark|system)$')
    fontSize: int | None = Field(None, ge=12, le=32)
    fontFamily: str | None = Field(None, max_length=50)
    readingGoal: int | None = Field(None, ge=1, le=50)
    dailyReadingMinutes: int | None = Field(None, ge=5, le=480)
    notificationsEnabled: bool | None = None
    language: str | None = Field(None, pattern=r'^(en|zh)$')
