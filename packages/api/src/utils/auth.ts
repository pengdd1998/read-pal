/**
 * Authentication Utilities
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { redisClient } from '../db';

const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

/** Redis key prefix for blacklisted tokens */
const TOKEN_BLACKLIST_PREFIX = 'auth:blacklist:';
const MAX_IN_MEMORY_BLACKLIST = 10_000;

/** In-memory fallback for when Redis is unavailable */
const inMemoryBlacklist = new Set<string>();

/** Whether Redis has been successfully contacted during this server instance */
let redisEverConnected = false;

/**
 * Get JWT secret — throws at import time if not configured.
 * This ensures the server cannot start without a proper secret.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is required. Set it before starting the server.');
  }
  if (secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters long.');
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
 *
 * Strategy (fail-closed):
 *  1. Check Redis — if reachable, authoritative answer.
 *  2. If Redis is down and was previously connected, the in-memory set
 *     contains every revocation since server start — trust it.
 *  3. If Redis was never connected during this server instance, we have
 *     zero blacklist data — fail-closed and reject the token.
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  try {
    const exists = await redisClient.exists(`${TOKEN_BLACKLIST_PREFIX}${jti}`);
    redisEverConnected = true;
    if (exists === 1) {
      inMemoryBlacklist.add(jti);
      return true;
    }
    return false;
  } catch {
    // Redis unavailable — check in-memory fallback
    if (inMemoryBlacklist.has(jti)) {
      return true;
    }

    // If Redis was never connected, we have no blacklist data — fail-closed.
    // The in-memory set is empty and we can't know what's in Redis.
    if (!redisEverConnected) {
      return true; // Reject — safer to deny than to accept unknown tokens
    }

    // Redis was connected before (so the in-memory set captured all revocations
    // during this server instance). Token not in set → not revoked.
    return false;
  }
}

/**
 * Revoke a token by its jti. Stores in Redis for the token's remaining TTL.
 * Always writes to the in-memory fallback first so that a subsequent Redis
 * outage does not allow a just-revoked token back in.
 */
export async function revokeToken(jti: string, expiresAtSeconds: number): Promise<void> {
  // Always record in-memory so the fallback is up-to-date
  inMemoryBlacklist.add(jti);

  // Evict oldest entries if the set grows too large
  if (inMemoryBlacklist.size > MAX_IN_MEMORY_BLACKLIST) {
    const entries = Array.from(inMemoryBlacklist);
    for (let i = 0; i < entries.length - MAX_IN_MEMORY_BLACKLIST; i++) {
      inMemoryBlacklist.delete(entries[i]);
    }
  }

  try {
    const ttl = Math.max(expiresAtSeconds - Math.floor(Date.now() / 1000), 1);
    await redisClient.setex(`${TOKEN_BLACKLIST_PREFIX}${jti}`, ttl, '1');
    redisEverConnected = true;
  } catch {
    // Redis unavailable — in-memory fallback already updated above
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
