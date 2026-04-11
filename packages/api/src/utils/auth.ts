/**
 * Authentication Utilities
 */

import jwt from 'jsonwebtoken';

const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Get JWT secret — throws at import time if not configured.
 * This ensures the server cannot start without a proper secret.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is required. Set it before starting the server.');
  }
  return secret;
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(userId: string): string {
  return jwt.sign(
    {
      userId,
    },
    getJwtSecret(),
    {
      expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    },
  );
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    return decoded;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // Expected format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}
