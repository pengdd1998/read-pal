/**
 * Unit tests for CompanionAgent.ts
 *
 * Tests the default reading companion agent that handles real-time
 * reading assistance. Covers: chat, context injection, tool usage
 * (library search trigger), conversation history management, error
 * handling, config defaults, and message formatting.
 *
 * All external deps (llmClient, LibrarySearchTool, WebSearchTool) are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks — must come before imports
// ---------------------------------------------------------------------------

const mockChatCompletion = jest.fn();
jest.mock('../../../services/llmClient', () => ({
  chatCompletion: (...args: unknown[]) => mockChatCompletion(...args),
  DEFAULT_MODEL: 'glm-4.7-flash',
}));

// Mock LibrarySearchTool — constructor registers tool
const mockLibraryExecute = jest.fn();
jest.mock('../../../agents/tools/LibrarySearchTool', () => ({
  LibrarySearchTool: jest.fn().mockImplementation(() => ({
    name: 'library_search',
    description: 'Search the user library',
    execute: mockLibraryExecute,
  })),
}));

// Mock WebSearchTool
const mockWebExecute = jest.fn();
jest.mock('../../../agents/tools/WebSearchTool', () => ({
  WebSearchTool: jest.fn().mockImplementation(() => ({
    name: 'web_search',
    description: 'Search the web',
    execute: mockWebExecute,
  })),
}));

import { CompanionAgent } from '../CompanionAgent';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompanionAgent', () => {
  let agent: CompanionAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChatCompletion.mockResolvedValue('AI response text');
    agent = new CompanionAgent();
  });

  // =========================================================================
  // Constructor & Config
  // =========================================================================

  describe('constructor', () => {
    it('should use default config values when no config provided', () => {
      const defaultAgent = new CompanionAgent();
      // Verify indirectly through chat calls
      expect(defaultAgent).toBeDefined();
    });

    it('should accept custom model config', async () => {
      const customAgent = new CompanionAgent({
        model: 'glm-4-plus',
        maxTokens: 512,
        temperature: 0.3,
      });

      mockChatCompletion.mockResolvedValue('custom response');

      await customAgent.chat('user-1', 'hello');

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'glm-4-plus',
          maxTokens: 512,
          temperature: 0.3,
        }),
      );
    });

    it('should register library_search and web_search tools', () => {
      // Tools are registered in constructor via mocked classes
      // Verified indirectly: library_search is called when trigger words are used
      expect(agent).toBeDefined();
    });
  });

  // =========================================================================
  // chat() — basic flow
  // =========================================================================

  describe('chat — basic flow', () => {
    it('should return the LLM response text', async () => {
      mockChatCompletion.mockResolvedValue('Quantum entanglement is a phenomenon...');

      const result = await agent.chat('user-1', 'Explain quantum entanglement');

      expect(result.response).toBe('Quantum entanglement is a phenomenon...');
    });

    it('should call chatCompletion with system prompt', async () => {
      await agent.chat('user-1', 'Hello');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      expect(callArgs.system).toContain('Companion Agent');
      expect(callArgs.system).toContain('read-pal');
      expect(callArgs.system).toContain('Available Tools');
    });

    it('should call chatCompletion with user message', async () => {
      await agent.chat('user-1', 'What is photosynthesis?');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const lastMsg = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(lastMsg.content).toContain('What is photosynthesis?');
    });

    it('should return fallback message when chatCompletion throws', async () => {
      mockChatCompletion.mockRejectedValue(new Error('API down'));

      const result = await agent.chat('user-1', 'test');

      expect(result.response).toContain('encountered an issue');
      expect(result.toolsUsed).toBeUndefined();
    });
  });

  // =========================================================================
  // chat() — context injection
  // =========================================================================

  describe('chat — context injection', () => {
    it('should include selected text in user message when context provided', async () => {
      await agent.chat('user-1', 'Explain this', {
        selectedText: 'The mitochondria is the powerhouse of the cell',
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const lastMsg = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMsg.content).toContain('Selected text: "The mitochondria is the powerhouse of the cell"');
    });

    it('should include current page in user message', async () => {
      await agent.chat('user-1', 'What is this about?', {
        currentPage: 41,
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const lastMsg = callArgs.messages[callArgs.messages.length - 1];
      // Page is 0-indexed internally, displayed as +1
      expect(lastMsg.content).toContain('Current page: 42');
    });

    it('should include reading level in user message', async () => {
      await agent.chat('user-1', 'Tell me more', {
        userReadingLevel: 'beginner',
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const lastMsg = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMsg.content).toContain('Reading level: beginner');
    });

    it('should combine all context parts when provided together', async () => {
      await agent.chat('user-1', 'Help me understand', {
        selectedText: 'some text',
        currentPage: 9,
        userReadingLevel: 'advanced',
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const lastMsg = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMsg.content).toContain('Selected text');
      expect(lastMsg.content).toContain('Current page');
      expect(lastMsg.content).toContain('Reading level');
    });

    it('should not add context wrapper when no context is provided', async () => {
      await agent.chat('user-1', 'Hello');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const lastMsg = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMsg.content).toBe('Hello');
    });
  });

  // =========================================================================
  // chat() — tool usage (library search)
  // =========================================================================

  describe('chat — library search tool trigger', () => {
    it('should trigger library search when message contains "related" and bookId context', async () => {
      mockLibraryExecute.mockResolvedValue({
        success: true,
        data: { summary: 'Found 3 related books about quantum physics' },
      });

      const result = await agent.chat('user-1', 'Are there related books?', {
        bookId: 'book-123',
      });

      expect(mockLibraryExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Are there related books?',
          userId: 'user-1',
          filters: { excludeBookId: 'book-123' },
        }),
        expect.anything(),
      );

      expect(result.toolsUsed).toContain('library_search');
      expect(result.response).toContain('Related content from your library');
    });

    it('should trigger library search for "similar" keyword', async () => {
      mockLibraryExecute.mockResolvedValue({
        success: true,
        data: { summary: 'Found similar content' },
      });

      await agent.chat('user-1', 'Anything similar to this?', {
        bookId: 'book-456',
      });

      expect(mockLibraryExecute).toHaveBeenCalled();
    });

    it('should trigger library search for "what else" keyword', async () => {
      mockLibraryExecute.mockResolvedValue({
        success: true,
        data: { summary: 'Other readings' },
      });

      await agent.chat('user-1', 'What else have I read about this?', {
        bookId: 'book-789',
      });

      expect(mockLibraryExecute).toHaveBeenCalled();
    });

    it('should NOT trigger library search when no bookId in context', async () => {
      await agent.chat('user-1', 'Are there related books?');

      expect(mockLibraryExecute).not.toHaveBeenCalled();
    });

    it('should NOT trigger library search for messages without trigger words', async () => {
      await agent.chat('user-1', 'Hello there', { bookId: 'book-123' });

      expect(mockLibraryExecute).not.toHaveBeenCalled();
    });

    it('should handle library search failure gracefully', async () => {
      mockLibraryExecute.mockRejectedValue(new Error('Pinecone down'));

      const result = await agent.chat('user-1', 'Related content?', {
        bookId: 'book-123',
      });

      // Should still return a response (from LLM, without tool data)
      expect(result.response).toBe('AI response text');
      expect(result.toolsUsed).toBeUndefined();
    });

    it('should handle failed library search result (success=false)', async () => {
      mockLibraryExecute.mockResolvedValue({
        success: false,
        error: { code: 'NO_RESULTS', message: 'No matches found' },
      });

      const result = await agent.chat('user-1', 'Related content?', {
        bookId: 'book-123',
      });

      expect(result.response).toBe('AI response text');
      expect(result.toolsUsed).toBeUndefined();
    });
  });

  // =========================================================================
  // chat() — conversation history
  // =========================================================================

  describe('chat — conversation history', () => {
    it('should maintain separate conversation histories per user', async () => {
      await agent.chat('user-1', 'First question');
      await agent.chat('user-2', 'Different user question');

      // user-1 should have 2 messages (user + assistant)
      expect(agent.getHistory('user-1')).toHaveLength(2);

      // user-2 should have 2 messages
      expect(agent.getHistory('user-2')).toHaveLength(2);
    });

    it('should send conversation history to LLM on subsequent messages', async () => {
      await agent.chat('user-1', 'First question');
      mockChatCompletion.mockClear();
      mockChatCompletion.mockResolvedValue('Second response');

      await agent.chat('user-1', 'Follow-up question');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      // Should include: first user msg + first assistant msg + current user msg
      // The history passed as messages includes previous turns + current
      expect(callArgs.messages.length).toBeGreaterThanOrEqual(3);
    });

    it('should trim history to last 10 messages', async () => {
      // Send 8 messages (each chat adds 2: user + assistant)
      for (let i = 0; i < 8; i++) {
        mockChatCompletion.mockResolvedValue(`Response ${i}`);
        await agent.chat('user-1', `Question ${i}`);
      }

      // After 8 chats: 16 messages total, trimmed to 10
      const history = agent.getHistory('user-1');
      expect(history.length).toBeLessThanOrEqual(10);
    });

    it('should include tool results in history when tools were used', async () => {
      mockLibraryExecute.mockResolvedValue({
        success: true,
        data: { summary: 'Related books found' },
      });

      await agent.chat('user-1', 'Related books?', { bookId: 'book-123' });

      const history = agent.getHistory('user-1');
      const assistantMsg = history.find(m => m.role === 'assistant');
      expect(assistantMsg?.content).toContain('Related content from your library');
    });
  });

  // =========================================================================
  // getHistory() & clearHistory()
  // =========================================================================

  describe('getHistory & clearHistory', () => {
    it('should return empty array for user with no history', () => {
      expect(agent.getHistory('unknown-user')).toEqual([]);
    });

    it('should return conversation history for a known user', async () => {
      mockChatCompletion.mockResolvedValue('Hello back');
      await agent.chat('user-1', 'Hello');

      const history = agent.getHistory('user-1');
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Hello');
      expect(history[1].role).toBe('assistant');
      expect(history[1].content).toBe('Hello back');
    });

    it('should clear history for a specific user', async () => {
      await agent.chat('user-1', 'Message 1');
      await agent.chat('user-2', 'Message 2');

      agent.clearHistory('user-1');

      expect(agent.getHistory('user-1')).toEqual([]);
      // user-2 should be unaffected
      expect(agent.getHistory('user-2')).toHaveLength(2);
    });

    it('should not throw when clearing history for non-existent user', () => {
      expect(() => {
        agent.clearHistory('unknown-user');
      }).not.toThrow();
    });
  });

  // =========================================================================
  // chat() — system prompt content
  // =========================================================================

  describe('chat — system prompt', () => {
    it('should include tool descriptions in system prompt', async () => {
      await agent.chat('user-1', 'Hello');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      expect(callArgs.system).toContain('library_search');
      expect(callArgs.system).toContain('web_search');
    });

    it('should include personality guidelines in system prompt', async () => {
      await agent.chat('user-1', 'Hello');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      expect(callArgs.system).toContain('Friendly but professional');
      expect(callArgs.system).toContain('Patient and supportive');
      expect(callArgs.system).toContain('concise');
    });

    it('should include constraints in system prompt', async () => {
      await agent.chat('user-1', 'Hello');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      expect(callArgs.system).toContain('200 words');
      expect(callArgs.system).toContain('Never make up information');
    });
  });

  // =========================================================================
  // chat() — edge cases
  // =========================================================================

  describe('chat — edge cases', () => {
    it('should handle empty message', async () => {
      const result = await agent.chat('user-1', '');

      expect(result.response).toBeDefined();
      expect(mockChatCompletion).toHaveBeenCalled();
    });

    it('should handle very long message', async () => {
      const longMessage = 'a'.repeat(10000);
      const result = await agent.chat('user-1', longMessage);

      expect(result.response).toBe('AI response text');
    });

    it('should handle null/undefined context gracefully', async () => {
      const result = await agent.chat('user-1', 'Hello', undefined);

      expect(result.response).toBe('AI response text');
    });

    it('should handle partial context (only bookId)', async () => {
      const result = await agent.chat('user-1', 'Hello', {
        bookId: 'book-123',
      });

      expect(result.response).toBe('AI response text');
    });
  });
});
