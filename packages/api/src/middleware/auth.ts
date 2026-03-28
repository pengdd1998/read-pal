import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ============================================================================
// Authentication Middleware
// ============================================================================

/**
 * Verify JWT token and attach user to request
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header'
        }
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided'
        }
      });
    }

    // Verify token
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const decoded = jwt.verify(token, secret) as JWTPayload;

    // Attach user to request
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name
    };

    next();

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired'
        }
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token'
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed'
      }
    });
  }
}

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
export function optionalAuthenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const secret = process.env.JWT_SECRET || 'dev-secret';
      const decoded = jwt.verify(token, secret) as JWTPayload;

      req.user = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name
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
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
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
  sub: string; // user ID
  email: string;
  name: string;
  iat: number;
  exp: number;
}
