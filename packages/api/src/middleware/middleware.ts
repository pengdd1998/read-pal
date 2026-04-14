import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import crypto from 'crypto';
import { EnvironmentConfig } from '../types';
import { dedup } from './dedup';

// ============================================================================
// Middleware
// ============================================================================

/**
 * Initialize Express middleware
 */
export function initializeMiddleware(
  app: express.Application,
  config: EnvironmentConfig
): void {
  // Trust proxy (for reverse proxies / load balancers)
  app.set('trust proxy', 1);

  // Compression
  app.use(compression());

  // Security headers with enhanced configuration
  app.use(helmet({
    contentSecurityPolicy: config.nodeEnv === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    } : false,
    crossOriginEmbedderPolicy: false,
    hsts: config.nodeEnv === 'production' ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    } : false,
  }));

  // CORS
  app.use(cors({
    origin: config.nodeEnv === 'production'
      ? (() => {
          // In production, CORS origins MUST be explicitly configured
          if (config.cors?.origins && config.cors.origins.length > 0) {
            return config.cors.origins;
          }
          console.warn('[SECURITY] No CORS_ORIGINS configured for production. Denying all cross-origin requests.');
          return false; // Deny all origins if not configured
        })()
      : ['http://localhost:3000', 'http://localhost:19006'],
    credentials: true
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Rate limiting
  if (config.nodeEnv !== 'test') {
    app.use('/api/', rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute
      standardHeaders: true,
      legacyHeaders: false,
      message: 'Too many requests from this IP, please try again later.'
    }));
  }

  // Request deduplication for concurrent identical GET requests
  app.use(dedup());

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
    });

    next();
  });

  // Request ID
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.id = req.headers['x-request-id'] as string || crypto.randomUUID();
    res.setHeader('X-Request-ID', req.id);
    next();
  });

  // ETag support — enables 304 Not Modified for unchanged data
  app.set('etag', 'weak');
}

// ============================================================================
// Error Handling
// ============================================================================

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

/**
 * Global error handler
 */
export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  // Never expose internal error messages to clients
  const message = statusCode < 500
    ? (err.message || 'Request failed')
    : 'An unexpected error occurred';

  // Log full error details server-side only
  console.error('API Error:', {
    requestId: req.id,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: req.id,
      version: process.env.API_VERSION || '1.0.0'
    }
  });
}

/**
 * 404 handler
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found'
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: _req.id,
      version: process.env.API_VERSION || '1.0.0'
    }
  });
}

// ============================================================================
// Type Extensions
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        id: string;
        email: string;
        name: string;
      };
      session?: {
        id: string;
        userId: string;
      };
    }
  }
}
