"""Pydantic v2 schemas for auth endpoints."""

from datetime import datetime
from uuid import UUID

import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pydantic.alias_generators import to_camel


class LoginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    email: EmailStr
    password: str = Field(max_length=72)
    platform: str = Field('web', pattern=r'^(web|mobile)$')


class RegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=100)
    platform: str = Field('web', pattern=r'^(web|mobile)$')

    @field_validator('password')
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    avatar: str | None = None
    settings: dict = {}
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class AuthData(BaseModel):
    user: UserResponse
    token: str
    refresh_token: str = Field(validation_alias='refreshToken', serialization_alias='refreshToken')

    model_config = ConfigDict(populate_by_name=True)


class AuthResponse(BaseModel):
    success: bool = True
    data: AuthData


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

    @field_validator('password')
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    current_password: str = Field(max_length=72)
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator('new_password')
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v


class RefreshTokenRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    refresh_token: str


class LogoutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    refresh_token: str | None = None


class RefreshData(BaseModel):
    token: str
    refresh_token: str = Field(validation_alias='refreshToken', serialization_alias='refreshToken')

    model_config = ConfigDict(populate_by_name=True)


class RefreshResponse(BaseModel):
    success: bool = True
    data: RefreshData


class MessageData(BaseModel):
    message: str


class MessageResponse(BaseModel):
    success: bool = True
    data: MessageData


class DeleteAccountRequest(BaseModel):
    """Password confirmation for account deletion."""
    password: str = Field(min_length=1, max_length=72)
    refresh_token: str | None = None
