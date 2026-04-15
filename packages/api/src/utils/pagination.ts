/**
 * Pagination Utilities
 *
 * Standardized pagination parsing and response formatting
 * for API route handlers.
 */

import { Request } from 'express';
import { PAGINATION } from '@read-pal/shared';

interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Parse pagination query parameters from a request.
 * Uses sensible defaults and caps at MAX_LIMIT.
 */
export function parsePagination(
  req: Request,
  defaultLimit: number = PAGINATION.DEFAULT_LIMIT,
): PaginationParams {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(
    parseInt(req.query.limit as string) || defaultLimit,
    PAGINATION.MAX_LIMIT,
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Build a standard paginated response body.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
