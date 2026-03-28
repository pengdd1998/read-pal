/**
 * Authentication Utilities Tests
 */

import { generateToken, verifyToken, extractToken } from '../../src/utils/auth';

describe('Auth Utils', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const userId = 'user-123';
      const token = generateToken(userId);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // Verify token structure
      const parts = token.split('.');
      expect(parts).toHaveLength(3); // header.payload.signature
    });

    it('should generate tokens with different user IDs', () => {
      const token1 = generateToken('user-1');
      const token2 = generateToken('user-2');

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const userId = 'user-123';
      const token = generateToken(userId);

      const decoded = verifyToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.userId).toBe(userId);
    });

    it('should return null for invalid token', () => {
      const decoded = verifyToken('invalid-token');

      expect(decoded).toBeNull();
    });

    it('should return null for malformed token', () => {
      const decoded = verifyToken('not.a.valid.token');

      expect(decoded).toBeNull();
    });
  });

  describe('extractToken', () => {
    it('should extract token from valid Authorization header', () => {
      const token = 'my-jwt-token';
      const authHeader = `Bearer ${token}`;

      const extracted = extractToken(authHeader);

      expect(extracted).toBe(token);
    });

    it('should return null for missing header', () => {
      const extracted = extractToken(undefined);

      expect(extracted).toBeNull();
    });

    it('should return null for invalid header format', () => {
      const extracted = extractToken('InvalidFormat token');

      expect(extracted).toBeNull();
    });

    it('should return null for header without Bearer prefix', () => {
      const extracted = extractToken('JustToken');

      expect(extracted).toBeNull();
    });
  });
});
