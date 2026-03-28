import { Router } from 'express';

// ============================================================================
// Health Check Routes
// ============================================================================

const router = Router();

/**
 * @route   GET /health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.API_VERSION || '1.0.0'
  };

  res.json(health);
});

/**
 * @route   GET /health/detailed
 * @desc    Detailed health check with service status
 * @access  Public
 */
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.API_VERSION || '1.0.0',
    services: {
      api: 'ok',
      database: await checkDatabase(),
      redis: await checkRedis(),
      pinecone: await checkPinecone(),
      neo4j: await checkNeo4j()
    }
  };

  const allServicesOk = Object.values(health.services).every(s => s === 'ok');

  res.status(allServicesOk ? 200 : 503).json(health);
});

// ============================================================================
// Service Health Checks
// ============================================================================

async function checkDatabase(): Promise<string> {
  try {
    // In production, actually ping the database
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkRedis(): Promise<string> {
  try {
    // In production, actually ping Redis
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkPinecone(): Promise<string> {
  try {
    // In production, actually check Pinecone
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkNeo4j(): Promise<string> {
  try {
    // In production, actually check Neo4j
    return 'ok';
  } catch {
    return 'error';
  }
}

export default router;
