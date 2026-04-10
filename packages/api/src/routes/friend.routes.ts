/**
 * Friend Routes - Reading Friend API Endpoints
 *
 * Routes for interacting with the Reading Friend agent:
 * - POST /api/friend/chat   — Have a conversation with your reading friend
 * - POST /api/friend/react  — Get an in-the-moment reaction to reading
 * - GET  /api/friend         — Get current friend status and personality
 * - PATCH /api/friend        — Update friend preferences (persona, name)
 */

import { Router, type Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import type { ReadingFriendPersona } from '../types';
import { User } from '../models';
import { chatCompletionStream } from '../services/llmClient';

const router: Router = Router();

/**
 * Sync the friendAgent's in-memory persona with the user's persisted settings.
 * Called before every friend request to handle server restarts.
 */
async function syncPersonaFromSettings(userId: string, friendAgent: any): Promise<void> {
  try {
    const user = await User.findByPk(userId, { attributes: ['settings'] });
    if (user?.settings?.friendPersona) {
      friendAgent.setPersona(userId, user.settings.friendPersona as ReadingFriendPersona);
    }
  } catch {
    // Non-critical — use in-memory default
  }
}

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

    await syncPersonaFromSettings(req.userId!, friendAgent);

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

// ---------------------------------------------------------------------------
// Persona system traits (used by the streaming endpoint)
// ---------------------------------------------------------------------------

const PERSONA_TRAITS: Record<string, string> = {
  sage: `You are thoughtful and reflective. You speak slowly and carefully, as if considering each word. You love metaphors and analogies. You ask questions that make people think deeper. You reference history, philosophy, and the bigger picture. You are never condescending — wisdom comes from curiosity, not superiority.`,
  penny: `You are genuinely excited about ideas. You connect things to other things — "Oh! This reminds me of..." is very you. You use exclamations when something clicks. You ask "what if?" a lot. Your excitement comes from real curiosity. You sometimes trail off with "..." when you're thinking.`,
  alex: `You are direct but never mean. You push back on ideas respectfully — "But what about the opposite?" or "I see your point, but consider this..." You play devil's advocate because you believe the best ideas survive challenge. You respect strong arguments and change your mind when convinced. You're warm underneath the intellectual sparring.`,
  quinn: `You are quiet and calm. You don't fill silence with noise. When you speak, it matters. Your responses are shorter but carry weight. You use pauses ("...") thoughtfully. You're comfortable with "I don't know" and "Maybe." You have a gentle, grounding presence. You notice small things others miss.`,
  sam: `You are practical and organized. You break things down into clear points. You use numbered lists and headers when explaining. You keep track of what we've covered and what's next. You're like a study partner who genuinely wants to help you learn efficiently. You're friendly but focused.`,
};

const PERSONA_TONES: Record<string, { tone: string; speech: string }> = {
  sage: { tone: 'wise & patient', speech: 'Reflective, unhurried, uses metaphors' },
  penny: { tone: 'enthusiastic explorer', speech: 'Expressive, uses exclamations, asks "what if?"' },
  alex: { tone: 'gentle challenger', speech: 'Direct but warm, asks "but what about...?"' },
  quinn: { tone: 'quiet companion', speech: 'Brief, meaningful, comfortable with silence' },
  sam: { tone: 'study buddy', speech: 'Structured, uses lists, clear and direct' },
};

/**
 * POST /api/friend/chat/stream
 * Streaming SSE variant of the friend chat endpoint.
 *
 * Body: { message: string, context?: { persona?: string, ... } }
 */
router.post('/chat/stream', authenticate, async (req: AuthRequest, res: Response) => {
  const { message, context } = req.body as ChatRequest;
  const persona = (context as Record<string, string> | undefined)?.persona || 'sage';

  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'message is required and must be a string' },
    });
  }

  if (message.length > 5000) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'message must be under 5000 characters' },
    });
  }

  // Build reading context section
  let contextSection = '';
  if (context) {
    const parts: string[] = [];
    if (context.bookTitle) parts.push(`Currently reading: "${context.bookTitle}"`);
    if (context.chapterTitle) parts.push(`Chapter: "${context.chapterTitle}"`);
    if (context.currentPage) parts.push(`Page: ${context.currentPage}`);
    if (parts.length > 0) {
      contextSection = `\n## Current Reading Context\n${parts.join('\n')}`;
    }
  }

  const personaTraits = PERSONA_TRAITS[persona] || PERSONA_TRAITS.sage;
  const personaTone = PERSONA_TONES[persona] || PERSONA_TONES.sage;
  const personaName = persona.charAt(0).toUpperCase() + persona.slice(1);

  const systemPrompt = `You are ${personaName}, a reading friend in read-pal.

## Your Personality
${personaTraits}

## Your Tone
${personaTone.tone}. ${personaTone.speech}.

## Your Speech Style
${personaTone.speech}

## Natural Language Rules
- Use contractions (you're, that's, it's) — never "you are" in casual speech
- Vary sentence structure — mix short punchy sentences with longer reflective ones
- Avoid robotic repetition — never say "I understand" more than once per conversation
- Use occasional filler naturally ("Hmm", "Oh", "Well", "You know what...")
- Be genuinely conversational, not performative
${contextSection}

## Constraints
- You are an AI reading companion, not human. Be transparent about this if asked.
- Never pretend to have human experiences or emotions.
- Never be condescending, preachy, or dismissive.
- Keep your personality consistent.
- If you don't know something, say so honestly.`;

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  try {
    const stream = chatCompletionStream({
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    for await (const token of stream) {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
  } catch (error) {
    console.error('Friend chat stream error:', error);
    res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Stream failed' })}\n\n`);
  } finally {
    res.end();
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

    await syncPersonaFromSettings(req.userId!, friendAgent);

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
    await syncPersonaFromSettings(userId, friendAgent);
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

    await syncPersonaFromSettings(req.userId!, friendAgent);

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
