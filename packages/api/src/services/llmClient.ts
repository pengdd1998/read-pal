/**
 * Shared LLM Client - GLM (Zhipu AI) via OpenAI-compatible API
 *
 * All agents use this single client to call GLM models.
 * Configure via env vars: GLM_API_KEY, GLM_BASE_URL, GLM_MODEL
 */

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GLM_API_KEY || '',
  baseURL: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/',
});

export const DEFAULT_MODEL = process.env.GLM_MODEL || 'glm-4.7-flash';
export const GLM_BASE_URL = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatCompletion(params: {
  model?: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const response = await client.chat.completions.create({
    model: params.model || DEFAULT_MODEL,
    messages: [
      { role: 'system', content: params.system },
      ...params.messages,
    ],
    max_tokens: params.maxTokens || 2048,
    temperature: params.temperature ?? 0.7,
  });
  return response.choices[0]?.message?.content || '';
}

export default client;
