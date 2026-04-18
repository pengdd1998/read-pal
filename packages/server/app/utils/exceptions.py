"""Custom exceptions for the read-pal API."""

from fastapi import HTTPException, status


class NotFoundError(HTTPException):
    """Resource not found."""

    def __init__(self, resource: str = 'Resource') -> None:
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'{resource} not found',
        )


class ForbiddenError(HTTPException):
    """User doesn't have permission."""

    def __init__(self, message: str = 'Forbidden') -> None:
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=message,
        )


class ConflictError(HTTPException):
    """Resource conflict (e.g., duplicate)."""

    def __init__(self, message: str = 'Conflict') -> None:
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=message,
        )


class ValidationError(HTTPException):
    """Business logic validation failure."""

    def __init__(self, message: str) -> None:
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=message,
        )
