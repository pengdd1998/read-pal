import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, ApiKey } from '../models';
import { getJwtSecret, isTokenRevoked } from '../utils/auth';
import { isApiKeyFormat, hashApiKey } from '../models/ApiKey';

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
 * Verify JWT token or API key and attach user to request
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

    const token = authHeader.substring(7);

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

    // Check if this is an API key (starts with rpk_)
    if (isApiKeyFormat(token)) {
      const keyHash = hashApiKey(token);
      const apiKey = await ApiKey.findOne({ where: { keyHash } });

      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: { code: 'INVALID_API_KEY', message: 'Invalid API key' },
        });
        return;
      }

      const user = await User.findByPk(apiKey.userId);
      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'API key owner not found' },
        });
        return;
      }

      // Update last used timestamp (fire and forget)
      apiKey.update({ lastUsedAt: new Date() }).catch((err) => { console.error('[Auth] API key lastUsedAt update failed:', err); });

      req.userId = user.id;
      req.user = { id: user.id, email: user.email, name: user.name };
      next();
      return;
    }

    // JWT token path
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as JWTPayload;

    const jti = decoded.jti;
    if (jti && await isTokenRevoked(jti)) {
      res.status(401).json({
        success: false,
        error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked' },
      });
      return;
    }

    const userId = decoded.userId || decoded.sub || '';

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
      const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as JWTPayload;

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
  jti?: string;    // unique token ID for blacklist
  email?: string;
  name?: string;
  iat?: number;
  exp?: number;
}
