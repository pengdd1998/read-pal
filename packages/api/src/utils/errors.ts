/**
 * Standardized API Error Responses
 *
 * Helpers for consistent error shapes across all route handlers.
 */

import type { Response } from 'express';

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

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
 * Send a 500 Internal Server Error response.
 */
export function serverError(res: Response, code: string, message: string): Response<ApiError> {
  return res.status(500).json({ success: false, error: { code, message } });
}

/**
 * Send a 503 Service Unavailable response.
 */
export function serviceUnavailable(res: Response, service: string): Response<ApiError> {
  return res.status(503).json({
    success: false,
    error: { code: 'SERVICE_UNAVAILABLE', message: `${service} is not available. Please check your configuration.` },
  });
}
