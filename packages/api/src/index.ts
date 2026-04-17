// ============================================================================
// Express Server
// ============================================================================

import express from 'express';
import { createAgentWrapper } from './agents/agentWrapper';
import 'dotenv/config';

import { initializeMiddleware, errorHandler, notFoundHandler } from './middleware/middleware';
import { IAgent, Logger } from './types';

// Routes
import healthRoutes from './routes/health.routes';
import agentRoutes from './routes/agent.routes';
import booksRoutes from './routes/books.routes';
import annotationsRoutes from './routes/annotations.routes';
import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';
import friendRoutes from './routes/friend.routes';
import statsRoutes from './routes/stats.routes';
import knowledgeRoutes from './routes/knowledge.routes';
import memoryBooksRoutes from './routes/memory-books.routes';
import discoveryRoutes from './routes/discovery.routes';
import interventionsRoutes from './routes/interventions.routes';
import settingsRoutes from './routes/settings.routes';
import readingSessionsRoutes from './routes/reading-sessions.routes';
import moodRoutes from './routes/mood.routes';
import shareRoutes from './routes/share.routes';
import notificationsRoutes from './routes/notifications.routes';
import recommendationsRoutes from './routes/recommendations.routes';
import challengesRoutes from './routes/challenges.routes';
import exportRoutes from './routes/export.routes';
import synthesisRoutes from './routes/synthesis.routes';
import googleAuthRoutes from './routes/google-auth.routes';
import flashcardsRoutes from './routes/flashcards.routes';
import studyModeRoutes from './routes/study-mode.routes';
import collectionsRoutes from './routes/collections.routes';
import bookClubsRoutes from './routes/book-clubs.routes';

// Agents
import { CompanionAgent } from './agents/companion/CompanionAgent';
import { ResearchAgent } from './agents/research/ResearchAgent';
import { CoachAgent } from './agents/coach/CoachAgent';
import { SynthesisAgent } from './agents/synthesis/SynthesisAgent';
import { FriendAgent } from './agents/friend/FriendAgent';
import { AgentOrchestrator, OrchestratorConfig } from './agents/orchestrator/AgentOrchestrator';

// Database & Models (import models to register them with Sequelize before sync)
import './models';
import { sequelize, initPinecone, closeConnections } from './db';
import { DEFAULT_MODEL } from './services/llmClient';

// ============================================================================
// Configuration
// ============================================================================

interface ServerConfig {
  nodeEnv: 'development' | 'staging' | 'production' | 'test';
  api: { port: number; url: string; version?: string };
  database: { url: string; poolMin: number; poolMax: number };
  redis: { url: string; password: string | undefined; db: number };
  pinecone: { apiKey: string; environment: string; index: string };
  neo4j: { uri: string; user: string; password: string };
  glm: { apiKey: string; baseUrl: string; model: string; maxTokens: number; temperature: number; timeout: number };
  auth: { provider: string; secret: string; domain: string | undefined; clientId: string | undefined; clientSecret: string | undefined };
  sentry?: { dsn: string; environment: string; tracesSampleRate: number };
  features: {
    readingFriend: boolean;
    knowledgeGraph: boolean;
    memoryBooks: boolean;
    collaborativeReading: boolean;
    ereaderIntegration: boolean;
  };
}

const config: ServerConfig = {
  nodeEnv: (process.env.NODE_ENV || 'development') as ServerConfig['nodeEnv'],
  api: {
    port: parseInt(process.env.API_PORT || '3001', 10),
    url: process.env.API_URL || 'http://localhost:3001'
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/readpal',
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '10', 10)
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10)
  },
  pinecone: {
    apiKey: process.env.PINECONE_API_KEY || '',
    environment: process.env.PINECONE_ENVIRONMENT || 'us-east-1-aws',
    index: process.env.PINECONE_INDEX || 'readpal-vectors'
  },
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || ''
  },
  glm: {
    apiKey: process.env.GLM_API_KEY || '',
    baseUrl: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/',
    model: process.env.GLM_MODEL || DEFAULT_MODEL,
    maxTokens: parseInt(process.env.GLM_MAX_TOKENS || '4096', 10),
    temperature: parseFloat(process.env.GLM_TEMPERATURE || '0.7'),
    timeout: parseInt(process.env.GLM_TIMEOUT || '30000', 10),
  },
  auth: {
    provider: process.env.AUTH_PROVIDER || 'auth0',
    secret: process.env.AUTH_SECRET || '',
    domain: process.env.AUTH_DOMAIN,
    clientId: process.env.AUTH_CLIENT_ID,
    clientSecret: process.env.AUTH_CLIENT_SECRET
  },
  sentry: process.env.SENTRY_DSN ? {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1')
  } : undefined,
  features: {
    readingFriend: process.env.FEATURE_READING_FRIEND === 'true',
    knowledgeGraph: process.env.FEATURE_KNOWLEDGE_GRAPH === 'true',
    memoryBooks: process.env.FEATURE_MEMORY_BOOKS === 'true',
    collaborativeReading: process.env.FEATURE_COLLABORATIVE_READING === 'true',
    ereaderIntegration: process.env.FEATURE_EREADER_INTEGRATION === 'true'
  }
};

// ============================================================================
// Initialize Express
// ============================================================================

// ============================================================================
// Startup Validation
// ============================================================================

function validateCriticalEnvVars(): void {
  const required: Array<{ name: string; value: string | undefined }> = [
    { name: 'GLM_API_KEY', value: process.env.GLM_API_KEY },
    { name: 'DATABASE_URL', value: process.env.DATABASE_URL },
    { name: 'JWT_SECRET', value: process.env.JWT_SECRET || process.env.AUTH_SECRET },
  ];

  const missing = required.filter((v) => !v.value);

  if (missing.length > 0) {
    const names = missing.map((v) => v.name).join(', ');
    if (process.env.NODE_ENV === 'production') {
      console.error(`[FATAL] Missing critical environment variables: ${names}. Refusing to start.`);
      process.exit(1);
    } else {
      console.warn(`[WARN] Missing environment variables: ${names}. Some features will be unavailable.`);
    }
  } else {
    console.log('[INFO] All critical environment variables are set.');
  }
}

const app: express.Application = express();

// Run startup validation
validateCriticalEnvVars();

// Initialize middleware
initializeMiddleware(app, config);

// ============================================================================
// Initialize Agent Orchestrator
// ============================================================================

const logger: Logger = {
  info: (message: string, meta?: unknown) => console.log(`[INFO] ${message}`, meta || ''),
  error: (message: string, meta?: unknown) => console.error(`[ERROR] ${message}`, meta || ''),
  warn: (message: string, meta?: unknown) => console.warn(`[WARN] ${message}`, meta || ''),
  debug: (message: string, meta?: unknown) => {
    if (config.nodeEnv === 'development') {
      console.log(`[DEBUG] ${message}`, meta || '');
    }
  },
};

let orchestrator: AgentOrchestrator | null = null;

async function initializeAgents(): Promise<void> {
  const apiKey = config.glm?.apiKey || process.env.GLM_API_KEY || '';

  if (!apiKey) {
    logger.warn('No GLM_API_KEY configured - agents will not be available');
    return;
  }

  try {
    // Create agent instances (GLM client reads env vars directly)
    const companionAgent = new CompanionAgent();
    const researchAgent = new ResearchAgent();
    const coachAgent = new CoachAgent();
    const synthesisAgent = new SynthesisAgent();
    const friendAgent = new FriendAgent();

    // Wrap agents to conform to IAgent interface
    const agents = new Map<string, IAgent>();
    agents.set('companion', createAgentWrapper('companion', 'Reading Companion', companionAgent));
    agents.set('research', createAgentWrapper('research', 'Research Assistant', researchAgent));
    agents.set('coach', createAgentWrapper('coach', 'Reading Coach', coachAgent));
    agents.set('synthesis', createAgentWrapper('synthesis', 'Knowledge Synthesizer', synthesisAgent));
    agents.set('friend', createAgentWrapper('friend', 'Reading Friend', friendAgent));

    const orchestratorConfig: OrchestratorConfig = {
      agents,
      defaultAgent: 'companion',
      fallbackAgent: 'companion',
    };

    orchestrator = new AgentOrchestrator(orchestratorConfig, logger);

    // Inject orchestrator into Express app
    app.set('orchestrator', orchestrator);

    // Inject friendAgent directly for friend routes
    app.set('friendAgent', friendAgent);

    logger.info('Agent orchestrator initialized', {
      agents: Array.from(agents.keys()),
      defaultAgent: 'companion',
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to initialize agent orchestrator', { error: errMsg });
  }
}

// ============================================================================
// Database Sync
// ============================================================================

async function syncDatabase(): Promise<void> {
  try {
    if (config.nodeEnv === 'production') {
      // In production, create tables that don't exist
      // Use FORCE_SYNC=true to drop and recreate all tables
      const force = process.env.FORCE_SYNC === 'true';
      await sequelize.sync({ force });
      logger.info('Database synced (production)', { force });
    } else {
      // In development, force sync to keep schema in sync with models
      const force = process.env.FORCE_SYNC === 'true';
      await sequelize.sync({ force });
      logger.info('Database synced (development)', { force });
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Database sync failed', { error: errMsg });
  }
}

// ============================================================================
// Routes
// ============================================================================

app.get('/', (req, res) => {
  res.json({
    name: 'read-pal API',
    version: config.api.version || '1.0.0',
    description: 'AI agent-based reading companion API',
    environment: config.nodeEnv,
    endpoints: {
      health: '/health',
      agents: '/api/agents'
    }
  });
});

// Health check
app.use('/health', healthRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/annotations', annotationsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/friend', friendRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/memory-books', memoryBooksRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/interventions', interventionsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reading-sessions', readingSessionsRoutes);
app.use('/api/agents/mood', moodRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/challenges', challengesRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/synthesis', synthesisRoutes);
app.use('/api/flashcards', flashcardsRoutes);
app.use('/api/study-mode', studyModeRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/book-clubs', bookClubsRoutes);

// ============================================================================
// Error Handling
// ============================================================================

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================================================
// Start Server
// ============================================================================

if (require.main === module) {
  (async () => {
    // Sync database
    await syncDatabase();

    // Initialize Pinecone (optional — logs warning if not configured)
    try { await initPinecone(); } catch (e) { console.warn('Pinecone init skipped:', (e as Error).message); }

    // Initialize agents
    await initializeAgents();

    const server = app.listen(config.api.port, () => {
      const agentStatus = orchestrator ? `🟢 ${orchestrator.getAgents().length} agents ready` : '🔴 Not configured';

      console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                   ║
║   read-pal API Server                            ║
║                                                   ║
║   Status: 🟢 Online                               ║
║   Environment: ${config.nodeEnv.padEnd(30)}║
║   Port: ${config.api.port.toString().padEnd(37)}║
║   Agents: ${agentStatus.padEnd(41)}║
║                                                   ║
║   Endpoints:                                      ║
║   • Health:        /health                        ║
║   • Agents:        /api/agents                    ║
║   • Auth:          /api/auth                      ║
║   • Books:         /api/books                     ║
║   • Annotations:   /api/annotations               ║
║   • Upload:        /api/upload                    ║
║   • Friend:        /api/friend                    ║
║   • Stats:         /api/stats                     ║
║   • Knowledge:     /api/knowledge                 ║
║   • Discovery:     /api/discovery                 ║
║                                                   ║
╚═══════════════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`${signal} received, shutting down gracefully...`);
      server.close(async () => {
        console.log('Server closed');
        try {
          await closeConnections();
          console.log('Database connections closed');
        } catch (err) {
          console.error('Error closing connections:', err);
        }
        process.exit(0);
      });
      // Force exit after 5s if graceful shutdown stalls
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 5000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })();
}

// ============================================================================
// Export app for testing
// ============================================================================

export default app;
export { config };
export { createAgentWrapper } from './agents/agentWrapper';
