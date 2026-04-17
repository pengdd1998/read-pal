/**
 * Authentication Routes
 *
 * Handles user authentication with bcrypt password hashing
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import { notFound } from '../utils/errors';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { generateToken, revokeToken, getJwtSecret, isTokenRevoked } from '../utils/auth';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';
import { redisClient } from '../db';

const router: Router = Router();

const BCRYPT_ROUNDS = 12;
const MAX_PASSWORD_LENGTH = 72; // bcrypt limit

const LOGIN_LOCKOUT_PREFIX = 'auth:lockout:';
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

async function checkLoginLockout(email: string): Promise<{ locked: boolean; remainingMs: number }> {
  try {
    const data = await redisClient.get(`${LOGIN_LOCKOUT_PREFIX}${email}`);
    if (!data) return { locked: false, remainingMs: 0 };
    const entry = JSON.parse(data) as { count: number; lockedUntil: number };
    if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
      return { locked: true, remainingMs: entry.lockedUntil - Date.now() };
    }
    await redisClient.del(`${LOGIN_LOCKOUT_PREFIX}${email}`);
    return { locked: false, remainingMs: 0 };
  } catch {
    return { locked: false, remainingMs: 0 };
  }
}

async function recordFailedLogin(email: string): Promise<void> {
  try {
    const key = `${LOGIN_LOCKOUT_PREFIX}${email}`;
    const data = await redisClient.get(key);
    const entry = data
      ? (JSON.parse(data) as { count: number; lockedUntil: number })
      : { count: 0, lockedUntil: 0 };
    entry.count++;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    // Auto-expire after lockout duration plus buffer
    await redisClient.set(key, JSON.stringify(entry), 'PX', LOCKOUT_DURATION_MS + 60_000);
  } catch {
    // Redis unavailable — can't track, but don't block login
  }
}

async function clearFailedLogins(email: string): Promise<void> {
  try {
    await redisClient.del(`${LOGIN_LOCKOUT_PREFIX}${email}`);
  } catch {
    // Ignore Redis errors
  }
}

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', rateLimiter({ windowMs: 60000, max: 10 }), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required',
        },
      });
    }

    // Check account lockout
    const lockout = await checkLoginLockout(email);
    if (lockout.locked) {
      const minutesLeft = Math.ceil(lockout.remainingMs / 60000);
      return res.status(429).json({
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: `Account temporarily locked. Try again in ${minutesLeft} minutes.`,
        },
      });
    }

    // Find user by email
    const user = await User.findOne({ where: { email } });

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Verify password against stored hash
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      await recordFailedLogin(email);
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Generate JWT token
    const token = generateToken(user.id);
    await clearFailedLogins(email);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          settings: user.settings,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: 'Failed to authenticate user',
      },
    });
  }
});

/**
 * POST /api/auth/register
 * Register a new user with hashed password
 */
router.post(
  '/register',
  rateLimiter({ windowMs: 60000, max: 5 }),
  validate([
    body('email').isEmail().withMessage('A valid email is required'),
    body('password').isLength({ min: 8, max: 72 }).withMessage('Password must be between 8 and 72 characters'),
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required and must be at most 100 characters'),
  ]),
  async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // express-validator handles basic validation;
    // additional bcrypt-aware password length check
    if (password && password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters long`,
        },
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'A user with this email already exists',
        },
      });
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create new user with hashed password
    const user = await User.create({
      email,
      name,
      passwordHash,
      settings: {
        theme: 'system',
        fontSize: 16,
        fontFamily: 'Inter',
        readingGoal: 2,
        dailyReadingMinutes: 30,
        notificationsEnabled: true,
      },
    });

    // Generate JWT token
    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          settings: user.settings,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_ERROR',
        message: 'Failed to register user',
      },
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await User.findByPk(req.userId);

    if (!user) {
      return notFound(res, 'User');
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        settings: user.settings,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_USER_ERROR',
        message: 'Failed to retrieve user profile',
      },
    });
  }
});

/**
 * PATCH /api/auth/me
 * Update current user profile
 */
router.patch('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await User.findByPk(req.userId);

    if (!user) {
      return notFound(res, 'User');
    }

    const { name, avatar, settings } = req.body;

    if (name) user.name = name;
    if (avatar !== undefined) user.avatar = avatar;
    if (settings) user.settings = { ...user.settings, ...settings };

    await user.save();

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        settings: user.settings,
      },
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_USER_ERROR',
        message: 'Failed to update user profile',
      },
    });
  }
});

/**
 * POST /api/auth/forgot-password
 * Generates a password reset token stored in Redis (1hr TTL).
 * In production, send email with reset link. For beta, log the link.
 */
router.post('/forgot-password', rateLimiter({ windowMs: 60000, max: 5 }), async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Email is required' },
    });
  }

  try {
    const user = await User.findOne({ where: { email } });
    if (user) {
      const resetToken = crypto.randomUUID();
      const RESET_TTL_S = 3600; // 1 hour

      await redisClient.set(
        `password-reset:${resetToken}`,
        JSON.stringify({ userId: user.id, email: user.email }),
        'EX',
        RESET_TTL_S,
      );

      // TODO: Send email with reset link in production
      // For beta, log the reset URL so admins can share it
      console.log(`[auth] Password reset for ${email}: /reset-password?token=${resetToken}`);
    }
  } catch {
    // Silently ignore errors to prevent enumeration
  }

  res.json({
    success: true,
    data: { message: 'If an account with that email exists, a reset link has been sent.' },
  });
});

/**
 * POST /api/auth/reset-password
 * Validates reset token and updates the user's password.
 */
router.post(
  '/reset-password',
  rateLimiter({ windowMs: 60000, max: 5 }),
  validate([
    body('token').isUUID().withMessage('Valid reset token is required'),
    body('password').isLength({ min: 8, max: 72 }).withMessage('Password must be between 8 and 72 characters'),
  ]),
  async (req, res) => {
    try {
      const { token, password } = req.body;

      const data = await redisClient.get(`password-reset:${token}`);
      if (!data) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Reset token is invalid or expired. Please request a new one.' },
        });
      }

      const { userId } = JSON.parse(data) as { userId: string; email: string };
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Reset token is invalid or expired.' },
        });
      }

      // Update password
      user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await user.save();

      // Consume the token so it can't be reused
      await redisClient.del(`password-reset:${token}`);

      console.log(`[auth] Password reset successful for user ${userId}`);

      res.json({
        success: true,
        data: { message: 'Password has been reset successfully. You can now sign in.' },
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'RESET_ERROR', message: 'Failed to reset password' },
      });
    }
  },
);

/**
 * POST /api/auth/logout
 * Logout user — revokes the current JWT token.
 * Requires authentication to prevent arbitrary token revocation.
 */
router.post('/logout', authenticate, async (req: AuthRequest, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as { jti?: string; exp?: number };
      if (decoded.jti && decoded.exp) {
        await revokeToken(decoded.jti, decoded.exp);
      }
    }
    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  } catch {
    // Token may be invalid/expired — still return success for idempotent logout
    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh authentication token — revokes the old token and issues a new one.
 */
router.post('/refresh', rateLimiter({ windowMs: 60000, max: 5 }), authenticate, async (req: AuthRequest, res) => {
  try {
    // Revoke old token — but first verify it hasn't already been revoked
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const oldToken = authHeader.substring(7);
      const decoded = jwt.verify(oldToken, getJwtSecret(), { algorithms: ['HS256'] }) as { jti?: string; exp?: number };
      if (decoded.jti && await isTokenRevoked(decoded.jti)) {
        return res.status(401).json({
          success: false,
          error: { code: 'TOKEN_REVOKED', message: 'Token has already been revoked' },
        });
      }
      if (decoded.jti && decoded.exp) {
        await revokeToken(decoded.jti, decoded.exp);
      }
    }

    // Generate new token
    const token = generateToken(req.userId!);

    res.json({
      success: true,
      data: { token },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REFRESH_ERROR',
        message: 'Failed to refresh token',
      },
    });
  }
});

/**
 * DELETE /api/auth/account
 * Delete user account and all associated data
 */
router.delete('/account', authenticate, rateLimiter({ windowMs: 60000, max: 3 }), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      return;
    }

    // Delete user — cascading deletes handle related data
    await User.destroy({ where: { id: userId } });

    console.log(`[auth] Account deleted: ${userId}`);

    res.json({
      success: true,
      data: { message: 'Account deleted successfully' },
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_FAILED', message: 'Failed to delete account' },
    });
  }
});

export default router;
