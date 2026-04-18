"""Pydantic v2 schemas for auth endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
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
    name: str | None = Field(None, min_length=1, max_length=100)
    avatar: str | None = None
    settings: dict | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=72)


class RefreshResponse(BaseModel):
    success: bool = True
    data: dict  # {token: str}


class MessageResponse(BaseModel):
    success: bool = True
    data: dict  # {message: str}
