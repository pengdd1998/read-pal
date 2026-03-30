/**
 * Friend Routes - Reading Friend API Endpoints
 *
 * Routes for interacting with the Reading Friend agent:
 * - POST /api/friend/chat   — Have a conversation with your reading friend
 * - POST /api/friend/react  — Get an in-the-moment reaction to reading
 * - GET  /api/friend         — Get current friend status and personality
 * - PATCH /api/friend        — Update friend preferences (persona, name)
 */

import { Router } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import type { ReadingFriendPersona } from '../types';

const router: Router = Router();

// ============================================================================
// Request/Response Types
// ============================================================================

interface ChatRequest {
  message: string;
  context?: {
    bookId?: string;
    bookTitle?: string;
    chapterTitle?: string;
    currentPage?: number;
    selectedText?: string;
    readingSpeed?: number;
    timeSinceLastInteraction?: number;
  };
}

interface ReactRequest {
  text: string;
  context?: {
    bookId?: string;
    bookTitle?: string;
    chapterTitle?: string;
    currentPage?: number;
  };
}

interface UpdateFriendRequest {
  persona?: ReadingFriendPersona;
  name?: string;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/friend/chat
 * Have a conversation with your reading friend.
 *
 * Body: { message: string, context?: { ... } }
 * Response: { success: true, data: { response, persona, emotion } }
 */
router.post('/chat', authenticate, async (req: AuthRequest, res) => {
  try {
    const { message, context } = req.body as ChatRequest;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'message is required and must be a string',
        },
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'message must be under 5000 characters',
        },
      });
    }

    const friendAgent = req.app.get('friendAgent');
    if (!friendAgent) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Reading Friend is not available. Please check your configuration.',
        },
      });
    }

    const result = await friendAgent.chat(req.userId!, message, context);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Friend chat error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FRIEND_CHAT_ERROR',
        message: 'Failed to process conversation',
      },
    });
  }
});

/**
 * POST /api/friend/react
 * Get an in-the-moment reaction to a passage the reader encountered.
 *
 * Body: { text: string, context?: { ... } }
 * Response: { success: true, data: { response, persona, emotion } }
 */
router.post('/react', authenticate, async (req: AuthRequest, res) => {
  try {
    const { text, context } = req.body as ReactRequest;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'text is required and must be a string',
        },
      });
    }

    if (text.length > 10000) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'text must be under 10000 characters',
        },
      });
    }

    const friendAgent = req.app.get('friendAgent');
    if (!friendAgent) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Reading Friend is not available. Please check your configuration.',
        },
      });
    }

    const result = await friendAgent.react(req.userId!, text, context);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Friend react error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FRIEND_REACT_ERROR',
        message: 'Failed to generate reaction',
      },
    });
  }
});

/**
 * GET /api/friend
 * Get the current reading friend status for the authenticated user.
 *
 * Response: { success: true, data: { persona, personaDetails, historyLength, allPersonas } }
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const friendAgent = req.app.get('friendAgent');
    if (!friendAgent) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Reading Friend is not available. Please check your configuration.',
        },
      });
    }

    const userId = req.userId!;
    const persona = friendAgent.getUserPersona(userId);
    const personaDetails = friendAgent.getPersonaDefinition(persona);
    const history = friendAgent.getHistory(userId);

    res.json({
      success: true,
      data: {
        persona,
        personaDetails,
        historyLength: history.length,
        allPersonas: friendAgent.getAllPersonas(),
      },
    });
  } catch (error) {
    console.error('Friend status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FRIEND_STATUS_ERROR',
        message: 'Failed to get friend status',
      },
    });
  }
});

/**
 * PATCH /api/friend
 * Update reading friend preferences.
 *
 * Body: { persona?: ReadingFriendPersona, name?: string }
 * Response: { success: true, data: { persona, personaDetails } }
 */
router.patch('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { persona } = req.body as UpdateFriendRequest;

    const friendAgent = req.app.get('friendAgent');
    if (!friendAgent) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Reading Friend is not available. Please check your configuration.',
        },
      });
    }

    if (persona !== undefined) {
      const validPersonas: ReadingFriendPersona[] = ['sage', 'penny', 'alex', 'quinn', 'sam'];
      if (!validPersonas.includes(persona)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: `persona must be one of: ${validPersonas.join(', ')}`,
          },
        });
      }

      friendAgent.setPersona(req.userId!, persona);
    }

    const currentPersona = friendAgent.getUserPersona(req.userId!);
    const personaDetails = friendAgent.getPersonaDefinition(currentPersona);

    res.json({
      success: true,
      data: {
        persona: currentPersona,
        personaDetails,
      },
    });
  } catch (error) {
    console.error('Friend update error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FRIEND_UPDATE_ERROR',
        message: 'Failed to update friend preferences',
      },
    });
  }
});

export default router;
