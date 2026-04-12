import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import crypto from 'crypto';
import { EnvironmentConfig } from '../types';

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
      ? config.cors?.origins || ['https://readpal.com']
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
  next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  console.error('API Error:', {
    requestId: req.id,
    error: err,
    path: req.path,
    method: req.method
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV === 'development' && { details: err.details })
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
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: req.id,
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
