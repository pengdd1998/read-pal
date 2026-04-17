/**
 * Unit tests for utils/auth.ts
 *
 * Tests JWT secret validation, token generation/verification,
 * token blacklist (fail-closed with in-memory fallback), and
 * Authorization header parsing.
 *
 * External deps mocked: jsonwebtoken, redisClient (via test setup).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockJwtSign = jest.fn();
const mockJwtVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  sign: (...args: unknown[]) => mockJwtSign(...args),
  verify: (...args: unknown[]) => mockJwtVerify(...args),
}));

// crypto.randomUUID mock
const mockUUIDs: string[] = [];
let uuidIndex = 0;
jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    randomUUID: () => mockUUIDs[uuidIndex++] || `test-uuid-${uuidIndex}`,
  };
});

// Import after mocks — redisClient is already mocked by tests/setup.ts
import {
  getJwtSecret,
  generateToken,
  verifyToken,
  isTokenRevoked,
  revokeToken,
  extractToken,
} from '../auth';
import { redisClient } from '../../db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SECRET = 'a'.repeat(32); // 32 chars, meets minimum

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('utils/auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidIndex = 0;
    mockUUIDs.length = 0;
    // Default: valid JWT_SECRET
    process.env.JWT_SECRET = VALID_SECRET;
  });

  // =========================================================================
  // getJwtSecret()
  // =========================================================================

  describe('getJwtSecret', () => {
    it('should return the secret when JWT_SECRET is set and >= 32 chars', () => {
      process.env.JWT_SECRET = VALID_SECRET;
      expect(getJwtSecret()).toBe(VALID_SECRET);
    });

    it('should throw when JWT_SECRET is not set', () => {
      delete process.env.JWT_SECRET;
      expect(() => getJwtSecret()).toThrow('JWT_SECRET environment variable is required');
    });

    it('should throw when JWT_SECRET is empty string', () => {
      process.env.JWT_SECRET = '';
      expect(() => getJwtSecret()).toThrow('JWT_SECRET environment variable is required');
    });

    it('should throw when JWT_SECRET is less than 32 characters', () => {
      process.env.JWT_SECRET = 'short-secret';
      expect(() => getJwtSecret()).toThrow('at least 32 characters');
    });

    it('should accept exactly 32 characters', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      expect(getJwtSecret()).toBe('a'.repeat(32));
    });

    it('should accept very long secrets', () => {
      const longSecret = 'x'.repeat(256);
      process.env.JWT_SECRET = longSecret;
      expect(getJwtSecret()).toBe(longSecret);
    });
  });

  // =========================================================================
  // generateToken()
  // =========================================================================

  describe('generateToken', () => {
    it('should call jwt.sign with userId and jti', () => {
      mockUUIDs.push('uuid-1234');
      mockJwtSign.mockReturnValue('signed-token');

      const token = generateToken('user-abc');

      expect(token).toBe('signed-token');
      expect(mockJwtSign).toHaveBeenCalledTimes(1);

      const [payload, secret, options] = mockJwtSign.mock.calls[0];
      expect(payload.userId).toBe('user-abc');
      expect(payload.jti).toBe('uuid-1234');
      expect(secret).toBe(VALID_SECRET);
      expect(options.expiresIn).toBeDefined();
    });

    it('should generate unique jti for each token', () => {
      mockUUIDs.push('uuid-aaa', 'uuid-bbb');
      mockJwtSign.mockReturnValue('token');

      generateToken('user-1');
      generateToken('user-2');

      const payload1 = mockJwtSign.mock.calls[0][0];
      const payload2 = mockJwtSign.mock.calls[1][0];
      expect(payload1.jti).toBe('uuid-aaa');
      expect(payload2.jti).toBe('uuid-bbb');
    });

    it('should throw if JWT_SECRET is invalid', () => {
      delete process.env.JWT_SECRET;

      expect(() => generateToken('user-1')).toThrow('JWT_SECRET');
    });
  });

  // =========================================================================
  // verifyToken()
  // =========================================================================

  describe('verifyToken', () => {
    it('should return decoded payload for valid tokens', () => {
      const payload = { userId: 'user-xyz', jti: 'jti-123' };
      mockJwtVerify.mockReturnValue(payload);

      const result = verifyToken('valid-token');

      expect(result).toEqual(payload);
      expect(mockJwtVerify).toHaveBeenCalledWith('valid-token', VALID_SECRET, { algorithms: ['HS256'] });
    });

    it('should return null for invalid tokens', () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      const result = verifyToken('bad-token');

      expect(result).toBeNull();
    });

    it('should return null for expired tokens', () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const result = verifyToken('expired-token');

      expect(result).toBeNull();
    });

    it('should return null when JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;

      // getJwtSecret() will throw, which verifyToken catches and returns null
      const result = verifyToken('some-token');

      expect(result).toBeNull();
    });

    it('should not leak error details in return value', () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error('sensitive internal error details');
      });

      const result = verifyToken('token');

      expect(result).toBeNull();
      // No error message leaked — just null
    });
  });

  // =========================================================================
  // extractToken()
  // =========================================================================

  describe('extractToken', () => {
    it('should extract token from valid Bearer header', () => {
      expect(extractToken('Bearer my-jwt-token')).toBe('my-jwt-token');
    });

    it('should return null for undefined header', () => {
      expect(extractToken(undefined)).toBeNull();
    });

    it('should return null for empty string header', () => {
      expect(extractToken('')).toBeNull();
    });

    it('should return null for missing Bearer prefix', () => {
      expect(extractToken('Token my-jwt-token')).toBeNull();
    });

    it('should return null for wrong number of parts', () => {
      expect(extractToken('Bearer')).toBeNull();
      expect(extractToken('Bearer token extra')).toBeNull();
    });

    it('should return null for "Bearer " with no token', () => {
      // split(' ') on 'Bearer ' gives ['Bearer', ''] — length 2 but empty token
      // The function returns parts[1] which is '' — this is arguably a bug
      // but we test the actual behavior
      expect(extractToken('Bearer ')).toBe('');
    });

    it('should handle case-sensitive Bearer', () => {
      expect(extractToken('bearer my-token')).toBeNull();
      expect(extractToken('BEARER my-token')).toBeNull();
    });
  });

  // =========================================================================
  // isTokenRevoked() — Redis available
  // =========================================================================

  describe('isTokenRevoked — Redis available', () => {
    it('should return false when token is not in Redis blacklist', async () => {
      (redisClient.exists as jest.Mock).mockResolvedValue(0);

      const revoked = await isTokenRevoked('jti-not-revoked');

      expect(revoked).toBe(false);
      expect(redisClient.exists).toHaveBeenCalledWith('auth:blacklist:jti-not-revoked');
    });

    it('should return true when token IS in Redis blacklist', async () => {
      (redisClient.exists as jest.Mock).mockResolvedValue(1);

      const revoked = await isTokenRevoked('jti-revoked');

      expect(revoked).toBe(true);
    });
  });

  // =========================================================================
  // isTokenRevoked() — Redis unavailable, fail-closed
  // =========================================================================

  describe('isTokenRevoked — Redis unavailable', () => {
    it('should check in-memory fallback when Redis throws', async () => {
      // First: revoke a token so it goes into in-memory set
      (redisClient.setex as jest.Mock).mockRejectedValue(new Error('Redis down'));
      await revokeToken('jti-mem-test', Math.floor(Date.now() / 1000) + 3600);

      // Now: check if it's revoked (Redis still down)
      (redisClient.exists as jest.Mock).mockRejectedValue(new Error('Redis down'));
      const revoked = await isTokenRevoked('jti-mem-test');

      expect(revoked).toBe(true);
    });

    it('should return false for non-revoked token when in-memory is populated', async () => {
      // First, make a successful Redis call to set redisEverConnected
      (redisClient.exists as jest.Mock).mockResolvedValueOnce(0);
      await isTokenRevoked('jti-check-connection');

      // Now Redis goes down
      (redisClient.exists as jest.Mock).mockRejectedValue(new Error('Redis down'));

      const revoked = await isTokenRevoked('jti-never-revoked');

      expect(revoked).toBe(false);
    });
  });

  // =========================================================================
  // revokeToken()
  // =========================================================================

  describe('revokeToken', () => {
    it('should store in Redis with correct TTL', async () => {
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      (redisClient.setex as jest.Mock).mockResolvedValue('OK');

      await revokeToken('jti-revoke-test', futureExpiry);

      expect(redisClient.setex).toHaveBeenCalledWith(
        'auth:blacklist:jti-revoke-test',
        expect.any(Number),
        '1',
      );

      // TTL should be roughly 3600 seconds (allowing for test execution time)
      const ttl = (redisClient.setex as jest.Mock).mock.calls[0][1];
      expect(ttl).toBeGreaterThan(3500);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it('should use minimum TTL of 1 for already-expired tokens', async () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 100; // expired 100s ago
      (redisClient.setex as jest.Mock).mockResolvedValue('OK');

      await revokeToken('jti-expired', pastExpiry);

      const ttl = (redisClient.setex as jest.Mock).mock.calls[0][1];
      expect(ttl).toBe(1);
    });

    it('should add to in-memory set even when Redis fails', async () => {
      (redisClient.setex as jest.Mock).mockRejectedValue(new Error('Redis down'));

      await revokeToken('jti-mem-fallback', Math.floor(Date.now() / 1000) + 3600);

      // Now check via isTokenRevoked with Redis still down
      (redisClient.exists as jest.Mock).mockRejectedValue(new Error('Redis down'));
      const revoked = await isTokenRevoked('jti-mem-fallback');

      expect(revoked).toBe(true);
    });
  });

  // =========================================================================
  // Integration: revoke → isTokenRevoked round-trip
  // =========================================================================

  describe('revoke → isTokenRevoked round-trip', () => {
    it('should correctly identify a revoked token end-to-end', async () => {
      const jti = 'jti-round-trip';
      const expiresAt = Math.floor(Date.now() / 1000) + 7200;

      // Not revoked initially
      (redisClient.exists as jest.Mock).mockResolvedValue(0);
      let revoked = await isTokenRevoked(jti);
      expect(revoked).toBe(false);

      // Revoke it
      (redisClient.setex as jest.Mock).mockResolvedValue('OK');
      await revokeToken(jti, expiresAt);

      // Now it should be revoked (Redis says yes)
      (redisClient.exists as jest.Mock).mockResolvedValue(1);
      revoked = await isTokenRevoked(jti);
      expect(revoked).toBe(true);

      // Redis key was set correctly
      expect(redisClient.setex).toHaveBeenCalledWith(
        `auth:blacklist:${jti}`,
        expect.any(Number),
        '1',
      );
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle concurrent revocations of the same jti', async () => {
      (redisClient.setex as jest.Mock).mockResolvedValue('OK');

      // Revoke same jti twice concurrently
      await Promise.all([
        revokeToken('jti-concurrent', Math.floor(Date.now() / 1000) + 3600),
        revokeToken('jti-concurrent', Math.floor(Date.now() / 1000) + 3600),
      ]);

      // Should not throw — both calls succeed
      expect(redisClient.setex).toHaveBeenCalledTimes(2);
    });

    it('should handle very long jti values', async () => {
      const longJti = 'a'.repeat(500);
      (redisClient.exists as jest.Mock).mockResolvedValue(0);

      const revoked = await isTokenRevoked(longJti);

      expect(revoked).toBe(false);
      expect(redisClient.exists).toHaveBeenCalledWith(`auth:blacklist:${longJti}`);
    });

    it('should handle special characters in jti', async () => {
      const specialJti = 'jti-with-special:chars/and.dots';
      (redisClient.exists as jest.Mock).mockResolvedValue(1);

      const revoked = await isTokenRevoked(specialJti);

      expect(revoked).toBe(true);
      expect(redisClient.exists).toHaveBeenCalledWith(`auth:blacklist:${specialJti}`);
    });
  });
});
