/**
 * Authentication Utilities
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { redisClient } from '../db';

const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

/** Redis key prefix for blacklisted tokens */
const TOKEN_BLACKLIST_PREFIX = 'auth:blacklist:';

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

export interface TokenPayload {
  userId: string;
  jti: string;
}

/**
 * Generate a JWT token for a user with a unique token ID (jti).
 */
export function generateToken(userId: string): string {
  return jwt.sign(
    {
      userId,
      jti: crypto.randomUUID(),
    },
    getJwtSecret(),
    {
      expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    },
  );
}

/**
 * Verify and decode a JWT token.
 * Returns null for invalid/expired tokens without logging details.
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
    return decoded;
  } catch {
    // Do not log token verification failures — prevents info leakage in logs
    return null;
  }
}

/**
 * Check if a token's jti has been blacklisted (e.g. after logout).
 * Returns true if the token is revoked.
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  try {
    const exists = await redisClient.exists(`${TOKEN_BLACKLIST_PREFIX}${jti}`);
    return exists === 1;
  } catch {
    // Redis unavailable — allow token through (fail open)
    return false;
  }
}

/**
 * Revoke a token by its jti. Stores in Redis for the token's remaining TTL.
 */
export async function revokeToken(jti: string, expiresAtSeconds: number): Promise<void> {
  try {
    const ttl = Math.max(expiresAtSeconds - Math.floor(Date.now() / 1000), 1);
    await redisClient.setex(`${TOKEN_BLACKLIST_PREFIX}${jti}`, ttl, '1');
  } catch {
    // Redis unavailable — best effort
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
