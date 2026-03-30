// ============================================================================
// Express Server
// ============================================================================

import express from 'express';
import 'dotenv/config';
import crypto from 'crypto';

import { initializeMiddleware, errorHandler, notFoundHandler } from './middleware/middleware';
import { EnvironmentConfig, IAgent, AgentRequest, AgentResponse, Logger } from './types';

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

// Agents
import { CompanionAgent } from './agents/companion/CompanionAgent';
import { ResearchAgent } from './agents/research/ResearchAgent';
import { CoachAgent } from './agents/coach/CoachAgent';
import { SynthesisAgent } from './agents/synthesis/SynthesisAgent';
import { FriendAgent } from './agents/friend/FriendAgent';
import { AgentOrchestrator, OrchestratorConfig } from './agents/orchestrator/AgentOrchestrator';

// Database
import { sequelize } from './db';

// WebSocket
import { wsManager } from './services/WebSocketManager';

// ============================================================================
// Configuration
// ============================================================================

const config: any = {
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
    environment: process.env.SENTRY_ENVIRONMENT || (process.env.NODE_ENV as any) || 'development',
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

const app: express.Application = express();

// Initialize middleware
initializeMiddleware(app, config);

// ============================================================================
// Initialize Agent Orchestrator
// ============================================================================

const logger: Logger = {
  info: (message: string, meta?: any) => console.log(`[INFO] ${message}`, meta || ''),
  error: (message: string, meta?: any) => console.error(`[ERROR] ${message}`, meta || ''),
  warn: (message: string, meta?: any) => console.warn(`[WARN] ${message}`, meta || ''),
  debug: (message: string, meta?: any) => {
    if (config.nodeEnv === 'development') {
      console.log(`[DEBUG] ${message}`, meta || '');
    }
  },
};

function createAgentWrapper(name: string, displayName: string, agentInstance: any): IAgent {
  return {
    name,
    displayName,
    version: '1.0.0',
    purpose: displayName,
    responsibilities: [],
    model: 'claude-3-5-sonnet-20241022' as any,
    systemPrompt: '',
    tools: [],
    memoryType: 'session' as any,
    interventionStyle: 'reactive' as any,
    execute: async (request: AgentRequest): Promise<AgentResponse> => {
      const startTime = Date.now();
      try {
        // Extract the query from the request input
        const input = request.input as Record<string, any> || {};
        const query = input.query || input.message || '';
        let result: any;

        // Each agent has a different method signature - adapt accordingly
        switch (name) {
          case 'companion':
            // CompanionAgent.chat(userId, message, context)
            result = await agentInstance.chat(request.userId, query, request.context);
            break;
          case 'coach':
            // CoachAgent.chat(userId, message, context)
            result = await agentInstance.chat(request.userId, query, request.context);
            break;
          case 'research':
            // ResearchAgent.execute(userId, message, action, context)
            result = await agentInstance.execute(request.userId, query, 'deep_dive', request.context);
            break;
          case 'synthesis':
            // SynthesisAgent.execute(request) - already uses AgentRequest
            result = await agentInstance.execute(request);
            break;
          case 'friend':
            // FriendAgent.chat(userId, message, context)
            result = await agentInstance.chat(request.userId, query, request.context);
            break;
          default:
            // Fallback for future agents
            if (typeof agentInstance.execute === 'function') {
              result = await agentInstance.execute(request);
            } else if (typeof agentInstance.chat === 'function') {
              result = await agentInstance.chat(request.userId, query, request.context);
            } else {
              throw new Error(`Agent ${name} has no compatible method`);
            }
        }

        // Extract response content - agents return { response } not { content }
        const content = result?.response || result?.content || result?.message || '';

        return {
          content,
          success: true,
          metadata: {
            agentName: name,
            tokensUsed: result?.metadata?.tokensUsed || result?.tokensUsed || 0,
            cost: result?.metadata?.cost || result?.cost || 0,
            duration: Date.now() - startTime,
            modelUsed: result?.metadata?.modelUsed || result?.modelUsed || 'claude-3-5-sonnet-20241022' as any,
          },
        };
      } catch (error: any) {
        logger.error(`Agent ${name} execution failed`, { error: error.message });
        return {
          content: 'I encountered an error processing your request. Please try again.',
          success: false,
          metadata: {
            agentName: name,
            tokensUsed: 0,
            cost: 0,
            duration: Date.now() - startTime,
            modelUsed: 'claude-3-5-sonnet-20241022' as any,
          },
          error: {
            code: 'AGENT_ERROR',
            message: error.message || 'Unknown error',
            recoverable: true,
          },
        };
      }
    },
  };
}

let orchestrator: AgentOrchestrator | null = null;

async function initializeAgents(): Promise<void> {
  const apiKey = config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || '';

  if (!apiKey) {
    logger.warn('No ANTHROPIC_API_KEY configured - agents will not be available');
    return;
  }

  try {
    // Create agent instances
    const companionAgent = new CompanionAgent({ apiKey });
    const researchAgent = new ResearchAgent({ apiKey });
    const coachAgent = new CoachAgent({ apiKey });
    const synthesisAgent = new SynthesisAgent({ apiKey });
    const friendAgent = new FriendAgent({ apiKey });

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
  } catch (error: any) {
    logger.error('Failed to initialize agent orchestrator', { error: error.message });
  }
}

// ============================================================================
// Database Sync
// ============================================================================

async function syncDatabase(): Promise<void> {
  try {
    const force = config.nodeEnv === 'development';
    if (config.nodeEnv === 'production' && force) {
      throw new Error('Cannot force sync in production');
    }
    await sequelize.sync({ force, alter: !force });
    logger.info('Database synced successfully', { force, alter: !force });
  } catch (error: any) {
    logger.error('Database sync failed', { error: error.message });
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
app.use('/api/agents', agentRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/annotations', annotationsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/friend', friendRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/memory-books', memoryBooksRoutes);

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

    // Initialize agents
    await initializeAgents();

    const server = app.listen(config.api.port, () => {
      const agentStatus = orchestrator ? `🟢 ${orchestrator.getAgents().length} agents ready` : '🔴 Not configured';

      // Initialize WebSocket on the HTTP server
      wsManager.initialize(server);

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
║                                                   ║
╚═══════════════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      wsManager.shutdown();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\nSIGINT received, shutting down gracefully...');
      wsManager.shutdown();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  })();
}

// ============================================================================
// Export app for testing
// ============================================================================

export default app;
export { config };
