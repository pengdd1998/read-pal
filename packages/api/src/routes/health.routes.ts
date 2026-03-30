import { Router } from 'express';
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
 * @route   GET /health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/', async (_req, res) => {
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
 * @access  Public
 */
router.get('/detailed', async (_req, res) => {
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
  } catch (error: any) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error.message,
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
  } catch (error: any) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error.message,
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
  } catch (error: any) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error.message,
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
  } catch (error: any) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: error.message,
    };
  }
}

export default router;
