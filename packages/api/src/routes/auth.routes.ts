/**
 * Authentication Routes
 *
 * Handles user authentication using Auth0
 */

import { Router } from 'express';
import { User } from '../models';
import { generateToken } from '../utils/auth';

const router = Router();

/**
 * POST /api/auth/login
 * Login with email and password (for development/testing)
 *
 * In production, this would use Auth0/Clerk OAuth flow
 */
router.post('/login', async (req, res) => {
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

    // TODO: In production, use Auth0/Clerk for authentication
    // For development, we'll create or get the user
    let user = await User.findOne({ where: { email } });

    if (!user) {
      // Create new user
      user = await User.create({
        email,
        name: email.split('@')[0], // Use email prefix as default name
      });
    }

    // Generate JWT token
    const token = generateToken(user.id);

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
 * Register a new user
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email, password, and name are required',
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

    // Create new user
    const user = await User.create({
      email,
      name,
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
router.get('/me', async (req, res) => {
  try {
    // User ID is extracted from token by auth middleware
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const user = await User.findByPk(userId);

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
router.patch('/me', async (req, res) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const user = await User.findByPk(userId);

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
 * POST /api/auth/logout
 * Logout user (invalidate token)
 */
router.post('/logout', async (req, res) => {
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
router.post('/refresh', async (req, res) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    // Generate new token
    const token = generateToken(userId);

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

export default router;
