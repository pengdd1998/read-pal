"""Pydantic v2 schemas for auth endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel


class LoginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    email: EmailStr
    password: str = Field(max_length=72)


class RegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=100)


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    avatar: str | None = None
    settings: dict = {}
    created_at: datetime

    model_config = {'from_attributes': True}


class AuthResponse(BaseModel):
    success: bool = True
    data: dict  # {user: UserResponse, token: str}


class UpdateProfileRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    name: str | None = Field(None, min_length=1, max_length=100)
    avatar: str | None = None
    settings: dict | None = None


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    token: str
    password: str = Field(min_length=8, max_length=72)


class RefreshResponse(BaseModel):
    success: bool = True
    data: dict  # {token: str}


class MessageResponse(BaseModel):
    success: bool = True
    data: dict  # {message: str}
