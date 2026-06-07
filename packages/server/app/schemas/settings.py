"""Settings schemas."""

from pydantic import BaseModel, ConfigDict, Field


class SettingsUpdate(BaseModel):
    """Schema for updating user settings.

    Only known setting keys are accepted. Unknown keys are rejected
    to prevent privilege escalation or data pollution.
    """

    model_config = ConfigDict(extra='forbid')

    theme: str | None = Field(None, pattern=r'^(light|dark|system)$')
    fontSize: int | None = Field(None, ge=12, le=32)
    fontFamily: str | None = Field(None, max_length=50)
    readingGoal: int | None = Field(None, ge=1, le=50)
    dailyReadingMinutes: int | None = Field(None, ge=5, le=480)
    notificationsEnabled: bool | None = None
    streakAlerts: bool | None = None
    friendMessages: bool | None = None
    friendPersona: str | None = Field(None, max_length=50)
    friendFrequency: str | None = Field(None, pattern=r'^(minimal|normal|frequent|daily|weekly|monthly)$')
    language: str | None = Field(None, pattern=r'^(en|zh)$')
    companionMode: str | None = Field(None, pattern=r'^(casual|academic|socratic)$')
    zoteroApiKey: str | None = Field(None, max_length=128)
    zoteroUserId: str | None = Field(None, max_length=32)
    readingGoals: dict | None = None
