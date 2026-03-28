// ============================================================================
// Express Server
// ============================================================================

import express from 'express';
import 'dotenv/config';

import { initializeMiddleware, errorHandler, notFoundHandler } from './middleware/middleware';
import { EnvironmentConfig } from './types';

// Routes
import healthRoutes from './routes/health.routes';
import agentRoutes from './routes/agent.routes';
import booksRoutes from './routes/books.routes';
import annotationsRoutes from './routes/annotations.routes';
import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';

// ============================================================================
// Configuration
// ============================================================================

const config: EnvironmentConfig = {
  nodeEnv: (process.env.NODE_ENV as any) || 'development',
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
    password: process.env.NEO4J_PASSWORD || 'password'
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    modelHaiku: (process.env.CLAUDE_MODEL_HAIKU || 'claude-3-5-haiku-20241022') as any,
    modelSonnet: (process.env.CLAUDE_MODEL_SONNET || 'claude-3-5-sonnet-20241022') as any,
    modelOpus: (process.env.CLAUDE_MODEL_OPUS || 'claude-3-opus-20240229') as any,
    maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '4096', 10),
    temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.7'),
    timeout: parseInt(process.env.CLAUDE_TIMEOUT || '30000', 10)
  },
  auth: {
    provider: process.env.AUTH_PROVIDER || 'auth0',
    secret: process.env.AUTH_SECRET || 'dev-secret',
    domain: process.env.AUTH_DOMAIN,
    clientId: process.env.AUTH_CLIENT_ID,
    clientSecret: process.env.AUTH_CLIENT_SECRET
  },
  sentry: process.env.SENTRY_DSN ? {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || config.nodeEnv,
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

const app = express();

// Initialize middleware
initializeMiddleware(app, config);

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
app.use('/api/agents', agentRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/annotations', annotationsRoutes);
app.use('/api/upload', uploadRoutes);

// ============================================================================
// Error Handling
// ============================================================================

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================================================
// Start Server
// ============================================================================

if (require.main === module) {
  const server = app.listen(config.api.port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                   ║
║   read-pal API Server                            ║
║                                                   ║
║   Status: 🟢 Online                               ║
║   Environment: ${config.nodeEnv.padEnd(30)}║
║   Port: ${config.api.port.toString().padEnd(37)}║
║   Version: ${config.api.version || '1.0.0'.padEnd(33)}║
║                                                   ║
║   Endpoints:                                      ║
║   • Health:  /health                              ║
║   • Agents:  /api/agents                          ║
║                                                   ║
╚═══════════════════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('\nSIGINT received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

// ============================================================================
// Export app for testing
// ============================================================================

export default app;
export { config };
