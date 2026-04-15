import { Router } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { agentRateLimiter } from '../middleware/rateLimiter';
import { SynthesisAgent } from '../agents/synthesis';
import type { AgentResponse } from '../types';

const router: Router = Router();

// Lazy-initialised singleton – created once on first request
let synthesisAgent: SynthesisAgent | null = null;

function getSynthesisAgent(): SynthesisAgent {
  if (!synthesisAgent) {
    synthesisAgent = new SynthesisAgent();
  }
  return synthesisAgent;
}

// Shared response shape
function formatResponse(res: AgentResponse) {
  return {
    success: res.success,
    content: res.content,
    data: res.data,
    metadata: res.metadata,
    error: res.error,
  };
}

// ============================================================================
// Synthesis Analysis Routes
// ============================================================================

/**
 * Generic synthesis analysis endpoint.
 * Body: { action, input }
 * action: 'synthesize' | 'cross_reference' | 'concept_map' | 'find_contradictions' | 'summary_report'
 */
router.post(
  '/analyze',
  authenticate,
  agentRateLimiter,
  validate([
    body('action')
      .isIn(['synthesize', 'cross_reference', 'concept_map', 'find_contradictions', 'summary_report'])
      .withMessage('Invalid action'),
    body('input').isObject().withMessage('Input must be an object'),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { action, input } = req.body;

      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User ID is required' },
        });
      }

      const agent = getSynthesisAgent();
      const response: AgentResponse = await agent.execute({
        userId: req.user.id,
        sessionId: (req.session as { id?: string })?.id || req.id!,
        action,
        input,
      });

      return res.status(response.success ? 200 : 500).json(formatResponse(response));
    } catch (error) {
      console.error('Synthesis analysis error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'SYNTHESIS_ERROR',
          message: error instanceof Error ? error.message : 'Synthesis analysis failed',
        },
      });
    }
  },
);

// ---------------------------------------------------------------------------
// Convenience routes for each action (simpler frontend usage)
// ---------------------------------------------------------------------------

/**
 * POST /api/synthesis/synthesize
 * Synthesize insights across multiple books.
 * Body: { query, bookIds?, theme?, depth? }
 */
router.post(
  '/synthesize',
  authenticate,
  agentRateLimiter,
  validate([
    body('query').isString().isLength({ min: 2, max: 2000 }).withMessage('Query is required (2-2000 chars)'),
    body('bookIds').optional().isArray().withMessage('bookIds must be an array'),
    body('theme').optional().isString().isLength({ max: 500 }),
    body('depth').optional().isIn(['brief', 'standard', 'deep']),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const agent = getSynthesisAgent();
      const response = await agent.execute({
        userId: req.user!.id,
        sessionId: (req.session as { id?: string })?.id || req.id!,
        action: 'synthesize',
        input: req.body,
      });
      return res.status(response.success ? 200 : 500).json(formatResponse(response));
    } catch (error) {
      console.error('Synthesize error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SYNTHESIS_ERROR', message: error instanceof Error ? error.message : 'Failed' },
      });
    }
  },
);

/**
 * POST /api/synthesis/cross-reference
 * Cross-reference a concept between books.
 * Body: { concept, sourceBookId, targetBookIds?, analysisType? }
 */
router.post(
  '/cross-reference',
  authenticate,
  agentRateLimiter,
  validate([
    body('concept').isString().isLength({ min: 2, max: 1000 }).withMessage('Concept is required'),
    body('sourceBookId').isUUID().withMessage('sourceBookId must be a UUID'),
    body('targetBookIds').optional().isArray(),
    body('analysisType').optional().isIn(['supporting', 'contradicting', 'extending', 'all']),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const agent = getSynthesisAgent();
      const response = await agent.execute({
        userId: req.user!.id,
        sessionId: (req.session as { id?: string })?.id || req.id!,
        action: 'cross_reference',
        input: req.body,
      });
      return res.status(response.success ? 200 : 500).json(formatResponse(response));
    } catch (error) {
      console.error('Cross-reference error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SYNTHESIS_ERROR', message: error instanceof Error ? error.message : 'Failed' },
      });
    }
  },
);

/**
 * POST /api/synthesis/concept-map
 * Generate a concept map for a topic.
 * Body: { topic, bookIds?, maxNodes? }
 */
router.post(
  '/concept-map',
  authenticate,
  agentRateLimiter,
  validate([
    body('topic').isString().isLength({ min: 2, max: 1000 }).withMessage('Topic is required'),
    body('bookIds').optional().isArray(),
    body('maxNodes').optional().isInt({ min: 5, max: 50 }).toInt(),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const agent = getSynthesisAgent();
      const response = await agent.execute({
        userId: req.user!.id,
        sessionId: (req.session as { id?: string })?.id || req.id!,
        action: 'concept_map',
        input: req.body,
      });
      return res.status(response.success ? 200 : 500).json(formatResponse(response));
    } catch (error) {
      console.error('Concept map error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SYNTHESIS_ERROR', message: error instanceof Error ? error.message : 'Failed' },
      });
    }
  },
);

/**
 * POST /api/synthesis/contradictions
 * Find contradictions across the library.
 * Body: { topic?, bookIds?, minSeverity? }
 */
router.post(
  '/contradictions',
  authenticate,
  agentRateLimiter,
  validate([
    body('topic').optional().isString().isLength({ max: 1000 }),
    body('bookIds').optional().isArray(),
    body('minSeverity').optional().isIn(['low', 'medium', 'high']),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const agent = getSynthesisAgent();
      const response = await agent.execute({
        userId: req.user!.id,
        sessionId: (req.session as { id?: string })?.id || req.id!,
        action: 'find_contradictions',
        input: req.body,
      });
      return res.status(response.success ? 200 : 500).json(formatResponse(response));
    } catch (error) {
      console.error('Contradictions error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SYNTHESIS_ERROR', message: error instanceof Error ? error.message : 'Failed' },
      });
    }
  },
);

/**
 * POST /api/synthesis/report
 * Generate a comprehensive summary report.
 * Body: { bookIds?, timeRange?, focus?, format? }
 */
router.post(
  '/report',
  authenticate,
  agentRateLimiter,
  validate([
    body('bookIds').optional().isArray(),
    body('timeRange').optional().isObject(),
    body('focus').optional().isString().isLength({ max: 2000 }),
    body('format').optional().isIn(['narrative', 'structured', 'academic']),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const agent = getSynthesisAgent();
      const response = await agent.execute({
        userId: req.user!.id,
        sessionId: (req.session as { id?: string })?.id || req.id!,
        action: 'summary_report',
        input: req.body,
      });
      return res.status(response.success ? 200 : 500).json(formatResponse(response));
    } catch (error) {
      console.error('Report error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SYNTHESIS_ERROR', message: error instanceof Error ? error.message : 'Failed' },
      });
    }
  },
);

/**
 * GET /api/synthesis/actions
 * Return the list of available synthesis actions.
 */
router.get('/actions', authenticate, (_req, res) => {
  const agent = getSynthesisAgent();
  return res.json({
    success: true,
    data: {
      actions: agent.getSupportedActions(),
    },
  });
});

export default router;
