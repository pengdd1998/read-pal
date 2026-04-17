/**
 * Standardized API Error Responses
 *
 * Helpers for consistent error shapes across all route handlers.
 */

import type { Request, Response, NextFunction } from 'express';

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Custom error classes
// ---------------------------------------------------------------------------

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource.toUpperCase().replace(/ /g, '_')}_NOT_FOUND`, `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

// ---------------------------------------------------------------------------
// Response helpers (for gradual migration — prefer throwing AppError)
// ---------------------------------------------------------------------------

/**
 * Send a 400 Bad Request response.
 */
export function badRequest(res: Response, code: string, message: string): Response<ApiError> {
  return res.status(400).json({ success: false, error: { code, message } });
}

/**
 * Send a 404 Not Found response.
 */
export function notFound(res: Response, resource: string): Response<ApiError> {
  return res.status(404).json({
    success: false,
    error: { code: `${resource.toUpperCase().replace(/ /g, '_')}_NOT_FOUND`, message: `${resource} not found` },
  });
}

/**
 * Send a 403 Forbidden response.
 */
export function forbidden(res: Response, message: string): Response<ApiError> {
  return res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message },
  });
}

/**
 * Send a 500 Internal Server Error response.
 */
export function serverError(res: Response, code: string, message: string): Response<ApiError> {
  return res.status(500).json({ success: false, error: { code, message } });
}

// ---------------------------------------------------------------------------
// Async route handler wrapper
// ---------------------------------------------------------------------------

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wraps async route handlers so unhandled rejections are forwarded to
 * the global error middleware instead of silently swallowed.
 *
 * @example
 * router.get('/books', asyncHandler(async (req, res) => {
 *   const books = await Book.findAll({ where: { userId: req.user!.id } });
 *   res.json({ success: true, data: books });
 * }));
 */
export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

