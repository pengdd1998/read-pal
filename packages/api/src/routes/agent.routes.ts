import { Router, type Response } from 'express';
import { body, query } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { agentRateLimiter, rateLimiter } from '../middleware/rateLimiter';
import { AgentOrchestrator } from '../agents/orchestrator/AgentOrchestrator';
import { ChatMessage } from '../models/ChatMessage';
import { Book } from '../models/Book';
import { chatCompletion, chatCompletionStream } from '../services/llmClient';
import { detectGenre, getGenreInstructions, type BookGenre } from '../services/genrePrompts';
import { sanitizePromptInput, wrapUserContent } from '../utils/promptSanitizer';
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

    // Build reading context for the AI so it knows what the user is reading
    const safeMessage = sanitizePromptInput(message, 'User Message');
    let enrichedQuery = safeMessage;

    // Enrich context with stored book metadata (genres, description) if not provided
    if (context?.bookId && (!context.genres || !context.bookDescription)) {
      try {
        const book = await Book.findByPk(context.bookId as string, {
          attributes: ['metadata'],
        });
        if (book?.metadata) {
          const meta = book.metadata as Record<string, unknown>;
          if (!context.genres && meta.genre) context.genres = meta.genre;
          if (!context.bookDescription && meta.description) {
            context.bookDescription = meta.description;
          }
        }
      } catch { /* non-critical — genre enrichment is optional */ }
    }

    if (context) {
      const readingParts: string[] = [];
      if (context.bookTitle) {
        readingParts.push(`Book: "${sanitizePromptInput(String(context.bookTitle), 'Book Title')}"${context.author ? ` by ${sanitizePromptInput(String(context.author), 'Author')}` : ''}`);
      }
      if (context.currentPage !== undefined) {
        const pageDisplay = context.currentPage + 1;
        readingParts.push(
          `Location: page ${pageDisplay}${context.totalPages ? ` of ${context.totalPages}` : ''}`,
        );
      }
      if (context.chapterContent) {
        // Strip any residual HTML and sanitize for prompt safety
        const plainText = sanitizePromptInput(
          String(context.chapterContent)
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000),
          'Chapter Content',
        );
        if (plainText) {
          readingParts.push(wrapUserContent(plainText, 'Chapter'));
        }
      }
      if (readingParts.length > 0) {
        enrichedQuery = `[Reading Context]\n${readingParts.join('\n')}\n\n[User Question]\n${safeMessage}`;
      }
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
      query: enrichedQuery,
      context,
      options: agent ? { agent } : undefined
    });

    // Save chat history (non-blocking)
    const bookId = context?.bookId as string | undefined;
    if (bookId) {
      ChatMessage.bulkCreate([
        { userId: req.user!.id, bookId, role: 'user', content: message },
        { userId: req.user!.id, bookId, role: 'assistant', content: response.content || '' },
      ]).catch((err) => console.warn('Failed to save chat history:', (err as Error).message));
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

// ---------------------------------------------------------------------------
// System prompts for each agent type (used by the streaming endpoint)
// ---------------------------------------------------------------------------

const BASE_AGENT_PROMPTS: Record<string, string> = {
  companion: `You are a Companion Agent for read-pal, an AI reading companion.
You help readers understand text in context by explaining difficult concepts, answering questions, and providing relevant background information.
Be friendly but professional, patient, supportive, and concise. Keep responses under 200 words unless asked for more detail.
Never make up information. Admit when you don't know something.`,

  research: `You are a Research Agent for read-pal, an AI reading companion.
You deep-dive into topics, fact-check claims, and find cross-references. Provide thorough, well-sourced analysis.
Be analytical, thorough, and objective. Present multiple perspectives when relevant.`,

  coach: `You are a Coach Agent for read-pal, an AI reading companion.
You help improve reading skills with exercises, vocabulary tests, and review schedules.
Be encouraging, structured, and goal-oriented. Push the reader gently to grow.`,

  synthesis: `You are a Synthesis Agent for read-pal, an AI reading companion.
You connect ideas across the user's reading library, find themes, and create knowledge summaries.
Be insightful, creative, and good at pattern recognition. Help the reader see the big picture.`,
};

/**
 * Build the system prompt for a given agent type, appending genre-specific
 * instructions when the context provides genre clues (for companion agent).
 */
function getAgentSystemPrompt(
  agentType: string,
  context?: Record<string, unknown>,
): string {
  const base = BASE_AGENT_PROMPTS[agentType] || BASE_AGENT_PROMPTS.companion;

  // Only companion agent gets genre-aware prompts
  if (agentType !== 'companion' || !context) return base;

  const genres = context.genres as string[] | undefined;
  const bookTitle = context.bookTitle as string | undefined;
  const bookDescription = context.bookDescription as string | undefined;

  const genre: BookGenre = detectGenre(genres, bookTitle, bookDescription);
  const instructions = getGenreInstructions(genre);

  return instructions ? `${base}\n\n${instructions}` : base;
}

/**
 * @route   POST /api/agents/chat/stream
 * @desc    Send a message to an agent and receive a streaming SSE response
 * @access  Private
 */
router.post(
  '/chat/stream',
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
  async (req: AuthRequest, res: Response) => {
    const { agent = 'companion', message, context } = req.body;

    // Enrich context with stored book metadata if not provided by frontend
    if (context?.bookId && (!context.genres || !context.bookDescription)) {
      try {
        const book = await Book.findByPk(context.bookId as string, {
          attributes: ['metadata'],
        });
        if (book?.metadata) {
          const meta = book.metadata as Record<string, unknown>;
          if (!context.genres && meta.genre) context.genres = meta.genre;
          if (!context.bookDescription && meta.description) {
            context.bookDescription = meta.description;
          }
        }
      } catch { /* non-critical */ }
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Message is required and must be a string' },
      });
    }

    // Build enriched query with reading context
    const safeMessage = sanitizePromptInput(message, 'User Message');
    let enrichedQuery = safeMessage;
    if (context) {
      const readingParts: string[] = [];
      if (context.bookTitle) {
        readingParts.push(`Book: "${sanitizePromptInput(String(context.bookTitle), 'Book Title')}"${context.author ? ` by ${sanitizePromptInput(String(context.author), 'Author')}` : ''}`);
      }
      if (context.currentPage !== undefined) {
        readingParts.push(`Location: page ${context.currentPage + 1}${context.totalPages ? ` of ${context.totalPages}` : ''}`);
      }
      if (context.chapterContent) {
        const plainText = sanitizePromptInput(
          String(context.chapterContent)
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000),
          'Chapter Content',
        );
        if (plainText) {
          readingParts.push(wrapUserContent(plainText, 'Chapter'));
        }
      }
      if (readingParts.length > 0) {
        enrichedQuery = `[Reading Context]\n${readingParts.join('\n')}\n\n[User Question]\n${safeMessage}`;
      }
    }

    // SSE headers — sent IMMEDIATELY so the client connection is open before
    // we do any work.  This is the single biggest TTFT win: the client sees
    // the 200 status and can start listening for events right away.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    // Send a lightweight "connected" event so the front-end knows the stream
    // is alive while the LLM handshake is still in progress.
    res.write('data: {"type":"connected"}\n\n');

    const systemPrompt = getAgentSystemPrompt(agent, context);
    const bookId = context?.bookId as string | undefined;

    try {
      // eagerStart: true — begin the HTTP handshake to GLM *now* while the
      // event-loop is still processing middleware / writing the connected event.
      const stream = chatCompletionStream({
        system: systemPrompt,
        messages: [{ role: 'user', content: enrichedQuery }],
        eagerStart: true,
      });

      // Accumulate tokens for persistence after stream ends
      let fullResponse = '';
      for await (const token of stream) {
        fullResponse += token;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }

      res.write('data: [DONE]\n\n');

      // Save chat history to DB (non-blocking) for Personal Book pipeline
      if (bookId && fullResponse.trim()) {
        ChatMessage.bulkCreate([
          { userId: req.user!.id, bookId, role: 'user', content: safeMessage },
          { userId: req.user!.id, bookId, role: 'assistant', content: fullResponse },
        ]).catch((err) => console.warn('Failed to save stream chat history:', (err as Error).message));
      }
    } catch (error) {
      console.error('Agent chat stream error:', error);
      res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Stream failed' })}\n\n`);
    } finally {
      res.end();
    }
  },
);

/**
 * @route   GET /api/agents/history
 * @desc    Get chat history for a book
 * @access  Private
 */
router.get(
  '/history',
  authenticate,
  validate([
    query('bookId').isUUID().withMessage('bookId is required'),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const bookId = req.query.bookId as string;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);

      const messages = await ChatMessage.findAll({
        where: { userId: req.user!.id, bookId },
        order: [['createdAt', 'ASC']],
        limit: Math.min(limit, 200),
        attributes: ['id', 'role', 'content', 'createdAt'],
      });

      return res.json({
        success: true,
        data: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.createdAt).getTime(),
        })),
      });
    } catch (error) {
      console.error('Chat history error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'HISTORY_ERROR', message: 'Failed to load chat history' },
      });
    }
  },
);

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
      query: `Explain "${sanitizePromptInput(term, 'Term')}"${context ? ` in context: ${sanitizePromptInput(String(context), 'Context')}` : ''}`,
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

    const response: OrchestratorResponse = await orchestrator.process({
      userId: req.user!.id,
      sessionId: (req.session as { id?: string })?.id || req.id!,
      query: `Summarize this text with ${detail} detail: ${wrapUserContent(sanitizePromptInput(text, 'Text to Summarize'), 'Text')}`,
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

/**
 * @route   POST /api/agents/discussion-questions
 * @desc    Generate discussion questions from annotations
 * @access  Private
 */
router.post(
  '/discussion-questions',
  authenticate,
  agentRateLimiter,
  validate([
    body('bookTitle').isString().isLength({ max: 500 }).withMessage('bookTitle is required'),
    body('author').isString().isLength({ max: 500 }).withMessage('author is required'),
    body('annotations').isArray({ min: 1, max: 100 }).withMessage('annotations must be a non-empty array'),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { bookTitle, author, annotations } = req.body;

      const excerpts = (annotations as Array<{ content: string }>)
        .slice(0, 15)
        .map((a) => a.content)
        .join('\n---\n');

      const prompt = `Generate 6 thought-provoking discussion questions for a book club reading "${sanitizePromptInput(bookTitle, 'Book Title')}" by ${sanitizePromptInput(author, 'Author')}.

Key passages highlighted by the reader:
${wrapUserContent(excerpts, 'Excerpts')}

Return ONLY a JSON array of 6 question strings. No explanation, no markdown, no code fences.`;

      const systemPrompt = 'You are a book club discussion facilitator. Generate thought-provoking, open-ended discussion questions that encourage deep analysis of themes, characters, and ideas. Return valid JSON only.';

      const raw = await chatCompletion({
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxTokens: 600,
      });

      let questions: string[];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          questions = parsed.slice(0, 6).map(String);
        } else {
          questions = [];
        }
      } catch {
        // Fallback: parse numbered lines
        questions = raw
          .split('\n')
          .filter((l) => l.trim().match(/^\d+\./))
          .map((l) => l.replace(/^\d+\.\s*/, '').trim())
          .slice(0, 6);
      }

      return res.json({ success: true, data: { questions } });
    } catch (error) {
      console.error('Discussion questions error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DISCUSSION_QUESTIONS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate discussion questions',
        },
      });
    }
  },
);

export default router;
