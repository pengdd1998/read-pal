import { Router } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { agentRateLimiter, rateLimiter } from '../middleware/rateLimiter';
import { AgentOrchestrator } from '../agents/orchestrator/AgentOrchestrator';
import { WebSocketManager } from '../services/WebSocketManager';
import type { StreamClient } from '../services/WebSocketManager';
import type { OrchestratorResponse } from '../agents/orchestrator/AgentOrchestrator';
import type { IAgent } from '../types';

const router: Router = Router();

// ============================================================================
// Agent Routes
// ============================================================================

/**
 * @route   POST /api/agents/chat
 * @desc    Send a message to an agent
 * @access  Private
 */
router.post(
  '/chat',
  rateLimiter({
    windowMs: 60000,
    max: 20,
    keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  }),
  authenticate,
  agentRateLimiter,
  validate([
    body('message').isLength({ max: 5000 }).withMessage('Message is required and must be at most 5000 characters'),
    body('context').optional().isObject().withMessage('Context must be an object'),
  ]),
  async (req: AuthRequest, res) => {
  try {
    const { agent, message, context } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Message is required and must be a string'
        }
      });
    }

    const orchestrator: AgentOrchestrator | null = req.app.get('orchestrator');
    if (!orchestrator) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Agent service is not available'
        }
      });
    }

    // Send WS notification that agent processing has started
    const wsManager: WebSocketManager | null = req.app.get('wsManager');
    const wsClient: StreamClient | undefined = wsManager?.getClientByUserId(req.user!.id);
    if (wsClient) {
      wsManager!.notifyAgentStart(wsClient.sessionId, agent || 'companion', message);
    }

    const response: OrchestratorResponse = await orchestrator.process({
      userId: req.user!.id,
      sessionId: (req.session as { id?: string })?.id || req.id!,
      query: message,
      context,
      options: agent ? { agent } : undefined
    });

    // Send WS notifications for agent results
    if (wsClient) {
      if (response.success) {
        for (const agentUsed of response.agentsUsed || []) {
          wsManager!.notifyAgentComplete(
            wsClient.sessionId,
            agentUsed.agentName,
            agentUsed.duration || 0,
            agentUsed.response?.metadata?.tokensUsed as number | undefined,
          );
        }
        wsManager!.notifyComplete(wsClient.sessionId, response.content, response.metadata);
      } else {
        wsManager!.notifyError(
          wsClient.sessionId,
          response.error?.message || 'Agent processing failed',
          response.error?.code,
        );
      }
    }

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      content: response.content,
      agentsUsed: response.agentsUsed,
      synthesis: response.synthesis,
      metadata: response.metadata,
      error: response.error
    });

  } catch (error) {
    console.error('Agent chat error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to process agent request'
      }
    });
  }
});

/**
 * @route   POST /api/agents/explain
 * @desc    Get an explanation for a term or concept
 * @access  Private
 */
router.post('/explain', authenticate, agentRateLimiter, async (req: AuthRequest, res) => {
  try {
    const { term, context } = req.body;

    if (!term || typeof term !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Term is required and must be a string'
        }
      });
    }

    if (term.length > 1000) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Term must be under 1000 characters'
        }
      });
    }

    const orchestrator: AgentOrchestrator | null = req.app.get('orchestrator');
    if (!orchestrator) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Agent service is not available'
        }
      });
    }

    const response: OrchestratorResponse = await orchestrator.process({
      userId: req.user!.id,
      sessionId: (req.session as { id?: string })?.id || req.id!,
      query: `Explain "${term}"${context ? ` in context: ${context}` : ''}`,
      options: { agent: 'companion' }
    });

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      content: response.content,
      metadata: response.metadata,
      error: response.error
    });
  } catch (error) {
    console.error('Explain error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'EXPLAIN_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate explanation'
      }
    });
  }
});

/**
 * @route   POST /api/agents/summarize
 * @desc    Generate a summary of text
 * @access  Private
 */
router.post('/summarize', authenticate, agentRateLimiter, async (req: AuthRequest, res) => {
  try {
    const { text, detail = 'medium' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Text is required and must be a string'
        }
      });
    }

    if (text.length > 50000) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Text must be under 50000 characters'
        }
      });
    }

    const orchestrator: AgentOrchestrator | null = req.app.get('orchestrator');
    if (!orchestrator) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Agent service is not available'
        }
      });
    }

    // For long texts, summarize in chunks
    let inputText = text;
    if (text.length > 5000) {
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += 5000) {
        chunks.push(text.substring(i, i + 5000));
      }
      inputText = chunks.join('\n\n---\n\n');
    }

    const response: OrchestratorResponse = await orchestrator.process({
      userId: req.user!.id,
      sessionId: (req.session as { id?: string })?.id || req.id!,
      query: `Summarize this text with ${detail} detail: ${inputText}`,
      options: { agent: 'companion' }
    });

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      content: response.content,
      metadata: response.metadata,
      error: response.error
    });
  } catch (error) {
    console.error('Summarize error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SUMMARIZE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate summary'
      }
    });
  }
});

/**
 * @route   GET /api/agents
 * @desc    Get list of available agents
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const orchestrator: AgentOrchestrator | null = req.app.get('orchestrator');
    if (!orchestrator) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Agent service is not available'
        }
      });
    }

    const agents: IAgent[] = orchestrator.getAgents();

    return res.json({
      success: true,
      data: {
        agents: agents.map((agent: IAgent) => ({
          name: agent.name,
          displayName: agent.displayName,
          purpose: agent.purpose,
          responsibilities: agent.responsibilities
        }))
      }
    });
  } catch (error) {
    console.error('Get agents error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'GET_AGENTS_ERROR',
        message: 'Failed to retrieve agent list'
      }
    });
  }
});

export default router;
