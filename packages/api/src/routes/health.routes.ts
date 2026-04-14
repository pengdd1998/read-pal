import { Router, Request, Response, NextFunction } from 'express';
import { sequelize, neo4jDriver, redisClient, getPinecone } from '../db';

// ============================================================================
// Health Check Routes
// ============================================================================

const router: Router = Router();

// Service check result type
interface ServiceCheckResult {
  status: 'ok' | 'error' | 'unconfigured';
  latencyMs?: number;
  error?: string;
}

/**
 * Check if an IP address belongs to a private/local network range.
 * Allows: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, ::1
 */
function isPrivateIP(ip: string): boolean {
  // Strip IPv6-mapped IPv4 prefix (::ffff:)
  const cleanIP = ip.replace(/^::ffff:/, '');

  // IPv6 loopback
  if (cleanIP === '::1') return true;

  // Must be IPv4 from here
  const parts = cleanIP.split('.');
  if (parts.length !== 4) return false;

  const octets = parts.map(Number);
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return false;

  const [a, b] = octets;

  // 127.0.0.0/8 — loopback
  if (a === 127) return true;

  // 10.0.0.0/8 — class A private
  if (a === 10) return true;

  // 172.16.0.0/12 — class B private
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 — class C private
  if (a === 192 && b === 168) return true;

  return false;
}

/**
 * Middleware: restrict access to private/local network IPs only.
 */
function requirePrivateNetwork(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || '';
  if (!isPrivateIP(ip)) {
    res.status(403).json({
      status: 'error',
      message: 'Access denied. Detailed health check is only available from private networks.',
    });
    return;
  }
  next();
}

/**
 * @route   GET /health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/', async (_req, res) => {
  // Cache health for 30s — avoids hammering on monitoring
  res.set('Cache-Control', 'public, max-age=30');
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.API_VERSION || '1.0.0',
  };

  res.json(health);
});

/**
 * @route   GET /health/detailed
 * @desc    Detailed health check with service status
 * @access  Private network only (127.0.0.1, 10.x, 172.16-31.x, 192.168.x)
 */
router.get('/detailed', requirePrivateNetwork, async (_req, res) => {
  const [database, redis, pinecone, neo4j] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkPinecone(),
    checkNeo4j(),
  ]);

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.API_VERSION || '1.0.0',
    services: {
      api: { status: 'ok' } as ServiceCheckResult,
      database,
      redis,
      pinecone,
      neo4j,
    },
  };

  const allServicesOk = Object.values(health.services).every(
    (s) => (s as ServiceCheckResult).status === 'ok' ||
           (s as ServiceCheckResult).status === 'unconfigured'
  );

  res.status(allServicesOk ? 200 : 503).json(health);
});

// ============================================================================
// Service Health Checks (Real Implementations)
// ============================================================================

async function checkDatabase(): Promise<ServiceCheckResult> {
  const start = Date.now();
  try {
    await sequelize.authenticate();
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (error: unknown) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkRedis(): Promise<ServiceCheckResult> {
  const start = Date.now();
  try {
    const pong = await redisClient.ping();
    return {
      status: pong === 'PONG' ? 'ok' : 'error',
      latencyMs: Date.now() - start,
    };
  } catch (error: unknown) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkPinecone(): Promise<ServiceCheckResult> {
  const start = Date.now();
  try {
    const client = getPinecone();
    if (!client) {
      return { status: 'unconfigured' };
    }
    // List indexes to verify connectivity and API key validity
    await client.listIndexes();
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (error: unknown) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkNeo4j(): Promise<ServiceCheckResult> {
  const start = Date.now();
  try {
    if (!neo4jDriver) {
      return { status: 'unconfigured' };
    }
    const serverInfo = await neo4jDriver.getServerInfo();
    return {
      status: serverInfo ? 'ok' : 'error',
      latencyMs: Date.now() - start,
    };
  } catch (error: unknown) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default router;
