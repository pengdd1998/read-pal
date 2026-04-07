/**
 * Shared LLM Client - GLM (Zhipu AI) via OpenAI-compatible API
 *
 * All agents use this single client to call GLM models.
 * Configure via env vars: GLM_API_KEY, GLM_BASE_URL, GLM_MODEL
 *
 * Features:
 * - Retry with exponential backoff for 429/5xx errors (3 attempts)
 * - 30s default timeout via AbortController
 * - Typed error handling with LLMClientError
 * - Input validation at startup
 */

import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

export class LLMClientError extends Error {
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly attempt: number;
  public readonly originalError?: Error;

  constructor(message: string, opts?: { statusCode?: number; retryable?: boolean; attempt?: number; cause?: Error }) {
    super(message);
    this.name = 'LLMClientError';
    this.statusCode = opts?.statusCode;
    this.retryable = opts?.retryable ?? false;
    this.attempt = opts?.attempt ?? 0;
    this.originalError = opts?.cause;
  }
}

// ---------------------------------------------------------------------------
// Configuration & validation
// ---------------------------------------------------------------------------

export const DEFAULT_MODEL = process.env.GLM_MODEL || 'glm-4.7-flash';
export const GLM_BASE_URL = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/';

const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const BASE_DELAY_MS = 1_000;

function validateApiKey(): string {
  const key = process.env.GLM_API_KEY;
  if (!key) {
    throw new LLMClientError(
      'GLM_API_KEY is not set. LLM calls will fail. Set the GLM_API_KEY environment variable.',
      { retryable: false },
    );
  }
  return key;
}

// Validate eagerly so misconfiguration is caught at import time in development.
if (process.env.NODE_ENV !== 'test') {
  try {
    validateApiKey();
  } catch (err) {
    console.error(`[llmClient] ${(err as Error).message}`);
    // Do not crash — log loudly so the operator sees it. Actual calls will
    // throw a clear error via validateApiKey() at call-time.
  }
}

const client = new OpenAI({
  apiKey: process.env.GLM_API_KEY || '',
  baseURL: GLM_BASE_URL,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRetryable(status: number | undefined): boolean {
  if (!status) return false;
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
  const prefix = `[llmClient]`;
  switch (level) {
    case 'info':
      console.log(`${prefix} ${message}`, meta ?? '');
      break;
    case 'warn':
      console.warn(`${prefix} ${message}`, meta ?? '');
      break;
    case 'error':
      console.error(`${prefix} ${message}`, meta ?? '');
      break;
  }
}

// ---------------------------------------------------------------------------
// Public interface (unchanged)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionParams {
  model?: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * Send a chat completion request to the GLM API with retry logic and timeout.
 *
 * - Retries up to MAX_RETRIES times on 429 / 5xx responses with exponential
 *   back-off (1s, 2s, 4s).
 * - Enforces a 30-second timeout via AbortController.
 * - Throws LLMClientError on non-retryable failures or when retries are
 *   exhausted.
 */
export async function chatCompletion(params: ChatCompletionParams): Promise<string> {
  // Validate API key on every call so a clear error is thrown even if the
  // process started without it (e.g. env added later but not reloaded).
  validateApiKey();

  const model = params.model || DEFAULT_MODEL;
  const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: params.system },
    ...params.messages,
  ];

  let lastError: LLMClientError | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      log('info', 'Sending chat completion request', { model, attempt, messageCount: params.messages.length });

      const response = await client.chat.completions.create(
        {
          model,
          messages: apiMessages,
          max_tokens: params.maxTokens || 2048,
          temperature: params.temperature ?? 0.7,
        },
        { signal: controller.signal },
      );

      const content = response.choices[0]?.message?.content || '';
      log('info', 'Chat completion succeeded', { model, attempt });
      return content;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      // Determine status code for retry decision
      const openaiErr = err as { status?: number; message?: string; name?: string };
      const statusCode = openaiErr.status;
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
        || openaiErr.name === 'AbortError'
        || (typeof openaiErr.message === 'string' && openaiErr.message.includes('abort'));

      if (isAbort) {
        lastError = new LLMClientError(
          `Request timed out after ${DEFAULT_TIMEOUT_MS}ms (attempt ${attempt}/${MAX_RETRIES})`,
          { statusCode: 408, retryable: true, attempt, cause: err as Error },
        );
      } else if (isRetryable(statusCode)) {
        lastError = new LLMClientError(
          `API returned ${statusCode} (attempt ${attempt}/${MAX_RETRIES}): ${openaiErr.message}`,
          { statusCode, retryable: true, attempt, cause: err as Error },
        );
      } else {
        // Non-retryable — throw immediately
        throw new LLMClientError(
          `API error ${statusCode ?? 'unknown'}: ${openaiErr.message}`,
          { statusCode, retryable: false, attempt, cause: err as Error },
        );
      }

      log('warn', `Retryable error on attempt ${attempt}`, { statusCode, model });

      // Exponential back-off: 1s, 2s, 4s
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        log('info', `Waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // All retries exhausted
  throw lastError ?? new LLMClientError('All retries exhausted', { retryable: false, attempt: MAX_RETRIES });
}

export default client;
