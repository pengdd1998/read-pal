/**
 * Mood Detection & Scene Image Generation Routes
 *
 * POST /api/agents/mood  — Detect the reading mood from text (returns mood word)
 * POST /api/agents/scene — Generate a background scene image from text (returns imageUrl)
 */

import { Router } from 'express';
import { createHash } from 'crypto';
import { chatCompletion, GLM_BASE_URL } from '../services/llmClient';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router: Router = Router();

// In-memory cache: hash -> { url, timestamp }
const sceneCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const BASE_URL = GLM_BASE_URL;

/**
 * Generate a short visual scene prompt from reading text.
 */
async function extractScenePrompt(text: string): Promise<string> {
  const raw = await chatCompletion({
    system: `You generate visual scene descriptions for AI image generation from book text. Rules:
- Describe the SETTING or ATMOSPHERE, never characters or people
- Use vivid, cinematic language with colors and lighting
- Keep it to 1-2 sentences max
- Focus on landscape, weather, architecture, nature, or abstract mood
- Always end with "soft atmospheric illustration, dreamlike, muted colors"`,
    messages: [{ role: 'user', content: text.slice(-600) }],
    maxTokens: 80,
    temperature: 0.7,
  });
  return raw.trim() || 'A calm, warm reading atmosphere, soft ambient light, soft atmospheric illustration, dreamlike, muted colors';
}

/**
 * Call CogView to generate an image.
 * Uses raw fetch because the OpenAI SDK constructs `/v1/images/generations`
 * while Zhipu uses `/paas/v4/images/generations`.
 */
async function generateImage(prompt: string): Promise<string> {
  const apiKey = process.env.GLM_API_KEY || '';
  const url = `${BASE_URL}images/generations`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'cogview-3-flash',
      prompt,
      size: '1024x1024',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CogView API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json() as { data: Array<{ url: string }> };
  const imageUrl = data.data?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL in CogView response');
  return imageUrl;
}

// ============================================================================
// POST /api/agents/mood
// ============================================================================

router.post('/', authenticate, rateLimiter({ windowMs: 60000, max: 30 }), async (req: AuthRequest, res) => {
  try {
    const { text } = req.body as { text?: string };

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'text is required' },
      });
    }

    if (text.length > 10000) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'text must be under 10,000 characters' },
      });
    }

    const raw = await chatCompletion({
      system: 'You detect the atmospheric mood of text. Respond with exactly ONE word from this list: rain, forest, night, sunset, ocean, storm, garden, city, fire, neutral. No other words, no explanation.',
      messages: [{ role: 'user', content: text.slice(-500) }],
      maxTokens: 10,
      temperature: 0.1,
    });

    const validMoods = ['rain', 'forest', 'night', 'sunset', 'ocean', 'storm', 'garden', 'city', 'fire', 'neutral'];
    const normalized = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
    const mood = validMoods.includes(normalized) ? normalized : 'neutral';

    res.json({ success: true, mood });
  } catch (error) {
    console.error('Mood detection error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'MOOD_ERROR', message: 'Failed to detect mood' },
    });
  }
});

// ============================================================================
// POST /api/agents/scene
// ============================================================================

router.post('/scene', authenticate, rateLimiter({ windowMs: 60000, max: 10 }), async (req: AuthRequest, res) => {
  try {
    const { text } = req.body as { text?: string };

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'text is required' },
      });
    }

    const snippet = text.slice(-600);

    // Check cache
    const cacheKey = createHash('md5').update(snippet).digest('hex').slice(0, 12);
    const cached = sceneCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({
        success: true,
        imageUrl: cached.url,
        prompt: '(cached)',
        cached: true,
      });
    }

    // Step 1: Extract visual scene prompt (with timeout)
    const scenePromise = extractScenePrompt(snippet);
    const imagePrompt = await Promise.race([
      scenePromise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Scene prompt timeout')), 8_000),
      ),
    ]);

    // Step 2: Generate image via CogView (with timeout)
    const imageUrl = await Promise.race([
      generateImage(imagePrompt),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Image generation timeout')), 30_000),
      ),
    ]);

    // Cache it
    sceneCache.set(cacheKey, { url: imageUrl, timestamp: Date.now() });

    // Clean old entries periodically
    if (sceneCache.size > 100) {
      const now = Date.now();
      for (const [key, val] of sceneCache) {
        if (now - val.timestamp > CACHE_TTL) sceneCache.delete(key);
      }
    }

    res.json({
      success: true,
      imageUrl,
      prompt: imagePrompt,
      cached: false,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Scene generation failed';
    const isRateLimit = msg.includes('429') || msg.includes('rate') || msg.includes('频率');
    console.error('Scene generation error:', msg);
    res.status(isRateLimit ? 429 : 500).json({
      success: false,
      error: {
        code: isRateLimit ? 'RATE_LIMITED' : 'SCENE_GENERATION_ERROR',
        message: isRateLimit ? 'AI service busy — try again shortly' : 'Failed to generate scene image',
      },
    });
  }
});

export default router;
