"""Pydantic schemas for API key endpoints."""

from pydantic import BaseModel, Field


class ApiKeyCreateRequest(BaseModel):
    """Request body for creating an API key."""

    name: str = Field(default='API Key', max_length=100)
