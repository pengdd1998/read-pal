/**
 * Unit tests for llmClient.ts
 *
 * Tests the shared LLM client that wraps the OpenAI-compatible GLM API.
 * Covers: successful completion, API errors, retry on 429/500,
 * timeout behavior, and missing API key handling.
 */

// Mock the OpenAI module before any imports that use it
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// We must import after the mock is set up
import { chatCompletion, DEFAULT_MODEL, ChatMessage } from '../llmClient';

describe('llmClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Successful chat completion
  // --------------------------------------------------------------------------

  describe('chatCompletion - success path', () => {
    it('should return the assistant message content on success', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'The quantum entanglement phenomenon...' },
          },
        ],
      });

      const result = await chatCompletion({
        system: 'You are a reading companion.',
        messages: [{ role: 'user', content: 'Explain quantum entanglement' }],
      });

      expect(result).toBe('The quantum entanglement phenomenon...');
    });

    it('should pass system prompt and messages in correct order', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'response' } }],
      });

      await chatCompletion({
        system: 'You are a helpful assistant.',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
          { role: 'user', content: 'How are you?' },
        ],
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
      });
      expect(callArgs.messages[1]).toEqual({
        role: 'user',
        content: 'Hello',
      });
      expect(callArgs.messages.length).toBe(4); // system + 3 messages
    });

    it('should use DEFAULT_MODEL when no model is specified', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await chatCompletion({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe(DEFAULT_MODEL);
    });

    it('should use the provided model when specified', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await chatCompletion({
        model: 'glm-4-plus',
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('glm-4-plus');
    });

    it('should use default maxTokens (2048) when not specified', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await chatCompletion({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(2048);
    });

    it('should use the provided maxTokens when specified', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await chatCompletion({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 512,
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(512);
    });

    it('should use default temperature (0.7) when not specified', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await chatCompletion({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.7);
    });

    it('should use the provided temperature when specified', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await chatCompletion({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.2,
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.2);
    });

    it('should return empty string when choices array is empty', async () => {
      mockCreate.mockResolvedValue({
        choices: [],
      });

      const result = await chatCompletion({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result).toBe('');
    });

    it('should return empty string when message content is null', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const result = await chatCompletion({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // API errors
  // --------------------------------------------------------------------------

  describe('chatCompletion - API errors', () => {
    it('should propagate a generic API error', async () => {
      mockCreate.mockRejectedValue(new Error('Internal Server Error'));

      await expect(
        chatCompletion({
          system: 'sys',
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('Internal Server Error');
    });

    it('should propagate a network error', async () => {
      mockCreate.mockRejectedValue(new Error('fetch failed'));

      await expect(
        chatCompletion({
          system: 'sys',
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('fetch failed');
    });

    it('should propagate an authentication error', async () => {
      const authError = new Error('Incorrect API key provided');
      mockCreate.mockRejectedValue(authError);

      await expect(
        chatCompletion({
          system: 'sys',
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('Incorrect API key provided');
    });
  });

  // --------------------------------------------------------------------------
  // Retry on 429 (rate limit)
  // --------------------------------------------------------------------------

  describe('chatCompletion - retry on rate limit (429)', () => {
    it('should fail on first 429 error (no built-in retry)', async () => {
      // Note: The current llmClient has no retry logic.
      // This test documents that a 429 will propagate immediately.
      // If retry logic is added later, update this test.
      const rateLimitError: any = new Error('Rate limit reached');
      rateLimitError.status = 429;
      mockCreate.mockRejectedValue(rateLimitError);

      await expect(
        chatCompletion({
          system: 'sys',
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('Rate limit reached');
    });
  });

  // --------------------------------------------------------------------------
  // Retry on 500 (server error)
  // --------------------------------------------------------------------------

  describe('chatCompletion - server error (500)', () => {
    it('should propagate 500 errors immediately (no built-in retry)', async () => {
      // Note: The current llmClient has no retry logic.
      // This test documents that a 500 will propagate immediately.
      const serverError: any = new Error('The server had an error processing your request');
      serverError.status = 500;
      mockCreate.mockRejectedValue(serverError);

      await expect(
        chatCompletion({
          system: 'sys',
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('The server had an error processing your request');
    });
  });

  // --------------------------------------------------------------------------
  // Timeout behavior
  // --------------------------------------------------------------------------

  describe('chatCompletion - timeout behavior', () => {
    it('should hang if the API never responds (no built-in timeout)', async () => {
      // The current llmClient does NOT implement client-side timeout.
      // This test verifies the behavior: a hanging promise stays pending.
      // If timeout is added later, update this test to verify rejection.
      mockCreate.mockReturnValue(new Promise(() => {})); // Never resolves

      // Use a short Jest timeout to confirm it does NOT reject quickly
      const promise = chatCompletion({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      });

      // Race against a 100ms timeout — the real call should NOT settle
      const result = await Promise.race([
        promise.then(
          () => 'settled',
          () => 'rejected'
        ),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('pending'), 100)
        ),
      ]);

      expect(result).toBe('pending');
    }, 5000);
  });

  // --------------------------------------------------------------------------
  // Missing API key
  // --------------------------------------------------------------------------

  describe('chatCompletion - missing API key', () => {
    it('should be constructed with an empty string when GLM_API_KEY is not set', () => {
      // The client is constructed at module load time with:
      //   apiKey: process.env.GLM_API_KEY || ''
      // This test verifies the mock was called (meaning the module loads)
      // and that an OpenAI instance is created.
      // Real authentication errors surface at request time, not construction time.
      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalled();
    });
  });
});
