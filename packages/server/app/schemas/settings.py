"""Settings schemas."""

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ZoteroValidateRequest(BaseModel):
    """Body for POST /settings/zotero/validate.

    Both fields are interpolated into the Zotero API URL, so each is pinned
    to the charset Zotero actually issues — ``userId`` is all digits and the
    key is alphanumeric with dashes. This blocks path traversal and
    query/fragment injection via ``/``, ``@``, ``?``, ``#``.
    """

    apiKey: str = Field(..., min_length=1, max_length=64)
    userId: str = Field(..., pattern=r'^\d+$')

    @field_validator('userId')
    @classmethod
    def validate_user_id_charset(cls, v: str) -> str:
        if '..' in v or '/' in v:
            raise ValueError('Invalid user ID')
        return v

    @field_validator('apiKey')
    @classmethod
    def validate_api_key_charset(cls, v: str) -> str:
        if not v or not all(c.isalnum() or c == '-' for c in v):
            raise ValueError('Invalid API key')
        return v


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
    # 'scholar' is the current frontend label (renamed from 'academic');
    # both accepted so older clients keep working.
    companionMode: str | None = Field(None, pattern=r'^(casual|academic|scholar|socratic)$')
    zoteroApiKey: str | None = Field(None, max_length=128)
    zoteroUserId: str | None = Field(None, max_length=32)
    readingGoals: dict | None = None
