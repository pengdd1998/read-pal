/**
 * Authentication Routes
 *
 * Handles user authentication with bcrypt password hashing
 */

import { Router } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import { User } from '../models';
import { generateToken } from '../utils/auth';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';

const router: Router = Router();

const BCRYPT_ROUNDS = 12;
const MAX_PASSWORD_LENGTH = 72; // bcrypt limit

// In-memory failed login tracking (resets on server restart)
const failedLoginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginLockout(email: string): { locked: boolean; remainingMs: number } {
  const entry = failedLoginAttempts.get(email);
  if (!entry) return { locked: false, remainingMs: 0 };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    return { locked: true, remainingMs: entry.lockedUntil - Date.now() };
  }
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    failedLoginAttempts.delete(email);
    return { locked: false, remainingMs: 0 };
  }
  return { locked: false, remainingMs: 0 };
}

function recordFailedLogin(email: string): void {
  const entry = failedLoginAttempts.get(email) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }
  failedLoginAttempts.set(email, entry);
}

function clearFailedLogins(email: string): void {
  failedLoginAttempts.delete(email);
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
    const lockout = checkLoginLockout(email);
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
      recordFailedLogin(email);
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
    clearFailedLogins(email);

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
    body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters'),
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
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
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
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
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
 * Stub — always returns success to prevent email enumeration.
 * Email sending not yet configured.
 */
router.post('/forgot-password', rateLimiter({ windowMs: 60000, max: 5 }), async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Email is required' },
    });
  }

  res.json({
    success: true,
    data: { message: 'If an account with that email exists, a reset link has been sent.' },
  });
});

/**
 * POST /api/auth/logout
 * Logout user (invalidate token)
 */
router.post('/logout', async (_req, res) => {
  // With JWT, logout is handled client-side by removing the token
  // For additional security, we could add the token to a blacklist in Redis
  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

/**
 * POST /api/auth/refresh
 * Refresh authentication token
 */
router.post('/refresh', authenticate, async (req: AuthRequest, res) => {
  try {
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
