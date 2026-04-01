/**
 * Mood Detection & Scene Image Generation Routes
 *
 * POST /api/agents/mood  — Detect the reading mood from text (returns mood word)
 * POST /api/agents/scene — Generate a background scene image from text (returns imageUrl)
 */

import { Router } from 'express';
import { createHash } from 'crypto';
import { chatCompletion, GLM_BASE_URL } from '../services/llmClient';

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

router.post('/', async (req, res) => {
  try {
    const { text } = req.body as { text?: string };

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'text is required' },
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
    res.json({ success: true, mood: 'neutral' });
  }
});

// ============================================================================
// POST /api/agents/scene
// ============================================================================

router.post('/scene', async (req, res) => {
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

    // Step 1: Extract visual scene prompt
    const imagePrompt = await extractScenePrompt(snippet);

    // Step 2: Generate image via CogView
    const imageUrl = await generateImage(imagePrompt);

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
    console.error('Scene generation error:', error);
    res.json({
      success: false,
      imageUrl: null,
      prompt: '',
      error: error instanceof Error ? error.message : 'Scene generation failed',
    });
  }
});

export default router;
