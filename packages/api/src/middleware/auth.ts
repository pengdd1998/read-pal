import { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models';

// ============================================================================
// Types
// ============================================================================

/**
 * Extended Request type with authenticated user data
 */
export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

// ============================================================================
// Authentication Middleware
// ============================================================================

/**
 * Verify JWT token and attach user to request
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header'
        }
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided'
        }
      });
      return;
    }

    // Verify token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Server configuration error' } });
      return;
    }
    const decoded = jwt.verify(token, secret) as JWTPayload;

    // Attach user to request
    const userId = decoded.userId || decoded.sub || '';

    // Verify user still exists in DB (handles stale tokens after DB resets)
    const user = await User.findByPk(userId);
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found. Please sign in again.'
        }
      });
      return;
    }

    req.userId = userId;
    req.user = {
      id: userId,
      email: user.email,
      name: user.name
    };

    next();

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired'
        }
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token'
        }
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed'
      }
    });
    return;
  }
}

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
export function optionalAuthenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Server configuration error' } });
      return;
    }
      const decoded = jwt.verify(token, secret) as JWTPayload;

      const userId = decoded.userId || decoded.sub || '';
      req.userId = userId;
      req.user = {
        id: userId,
        email: decoded.email || '',
        name: decoded.name || ''
      };
    }

    next();

  } catch (error) {
    // Don't fail on auth errors, just continue without user
    next();
  }
}

/**
 * Check if user has required permissions
 */
export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    // In production, check user permissions from database
    // For now, just pass through
    next();
  };
}

// ============================================================================
// Types
// ============================================================================

interface JWTPayload {
  userId?: string; // from generateToken
  sub?: string;    // alternative user ID field
  email?: string;
  name?: string;
  iat?: number;
  exp?: number;
}
