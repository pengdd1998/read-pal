/**
 * Agent Wiring Integration Tests
 *
 * Tests that verify the critical agent wiring path:
 * - createAgentWrapper correctly routes to each agent's method
 * - Response extraction works for all return shapes
 * - Error handling covers agent failures
 */

import { createAgentWrapper } from '../../src/agents/agentWrapper';
import { AgentRequest } from '../../src/types';

function makeRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    userId: 'test-user',
    sessionId: 'session-1',
    action: 'chat',
    input: { query: 'What is the meaning of life?' },
    context: { bookId: 'book-1' } as any,
    ...overrides,
  };
}

describe('Agent Wiring', () => {
  describe('createAgentWrapper method routing', () => {
    it('should call chat(userId, query, context) for companion agent', async () => {
      const mockAgent = {
        chat: jest.fn().mockResolvedValue({ response: 'Companion says hi' }),
      };
      const wrapper = createAgentWrapper('companion', 'Reading Companion', mockAgent);
      const result = await wrapper.execute(makeRequest());

      expect(mockAgent.chat).toHaveBeenCalledWith('test-user', 'What is the meaning of life?', { bookId: 'book-1' });
      expect(result.content).toBe('Companion says hi');
      expect(result.success).toBe(true);
    });

    it('should call chat(userId, query, context) for coach agent', async () => {
      const mockAgent = {
        chat: jest.fn().mockResolvedValue({ response: 'Coach says focus!' }),
      };
      const wrapper = createAgentWrapper('coach', 'Reading Coach', mockAgent);
      const result = await wrapper.execute(makeRequest());

      expect(mockAgent.chat).toHaveBeenCalledWith('test-user', 'What is the meaning of life?', { bookId: 'book-1' });
      expect(result.content).toBe('Coach says focus!');
    });

    it('should call execute(userId, query, action, context) for research agent', async () => {
      const mockAgent = {
        execute: jest.fn().mockResolvedValue({ response: 'Research findings...' }),
      };
      const wrapper = createAgentWrapper('research', 'Research Assistant', mockAgent);
      const result = await wrapper.execute(makeRequest());

      expect(mockAgent.execute).toHaveBeenCalledWith('test-user', 'What is the meaning of life?', 'deep_dive', { bookId: 'book-1' });
      expect(result.content).toBe('Research findings...');
    });

    it('should call execute(request) for synthesis agent', async () => {
      const mockAgent = {
        execute: jest.fn().mockResolvedValue({ content: 'Synthesis result', success: true }),
      };
      const wrapper = createAgentWrapper('synthesis', 'Knowledge Synthesizer', mockAgent);
      const req = makeRequest();
      const result = await wrapper.execute(req);

      expect(mockAgent.execute).toHaveBeenCalledWith(req);
      expect(result.content).toBe('Synthesis result');
    });

    it('should call chat(userId, query, context) for friend agent', async () => {
      const mockAgent = {
        chat: jest.fn().mockResolvedValue({ response: 'Hey friend!', persona: 'penny', emotion: 'happy' }),
      };
      const wrapper = createAgentWrapper('friend', 'Reading Friend', mockAgent);
      const result = await wrapper.execute(makeRequest());

      expect(mockAgent.chat).toHaveBeenCalledWith('test-user', 'What is the meaning of life?', { bookId: 'book-1' });
      expect(result.content).toBe('Hey friend!');
    });
  });

  describe('Response extraction', () => {
    it('should extract response field from agent results', async () => {
      const mockAgent = { chat: jest.fn().mockResolvedValue({ response: 'primary field' }) };
      const wrapper = createAgentWrapper('companion', 'Companion', mockAgent);
      const result = await wrapper.execute(makeRequest());
      expect(result.content).toBe('primary field');
    });

    it('should fallback to content field if response missing', async () => {
      const mockAgent = { chat: jest.fn().mockResolvedValue({ content: 'fallback content' }) };
      const wrapper = createAgentWrapper('companion', 'Companion', mockAgent);
      const result = await wrapper.execute(makeRequest());
      expect(result.content).toBe('fallback content');
    });

    it('should fallback to message field if response and content missing', async () => {
      const mockAgent = { chat: jest.fn().mockResolvedValue({ message: 'fallback message' }) };
      const wrapper = createAgentWrapper('companion', 'Companion', mockAgent);
      const result = await wrapper.execute(makeRequest());
      expect(result.content).toBe('fallback message');
    });

    it('should return empty string if no known field exists', async () => {
      const mockAgent = { chat: jest.fn().mockResolvedValue({ data: [1, 2, 3] }) };
      const wrapper = createAgentWrapper('companion', 'Companion', mockAgent);
      const result = await wrapper.execute(makeRequest());
      expect(result.content).toBe('');
    });
  });

  describe('Error handling', () => {
    it('should catch agent errors and return error response', async () => {
      const mockAgent = { chat: jest.fn().mockRejectedValue(new Error('Agent crashed')) };
      const wrapper = createAgentWrapper('companion', 'Companion', mockAgent);
      const result = await wrapper.execute(makeRequest());

      expect(result.success).toBe(false);
      expect(result.content).toContain('error');
      expect(result.metadata?.tokensUsed).toBe(0);
    });

    it('should track duration metadata', async () => {
      const mockAgent = { chat: jest.fn().mockImplementation(() => new Promise((r) => setTimeout(() => r({ response: 'ok' }), 10))) };
      const wrapper = createAgentWrapper('companion', 'Companion', mockAgent);
      const result = await wrapper.execute(makeRequest());

      expect(result.success).toBe(true);
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Input extraction', () => {
    it('should extract query from input.query', async () => {
      const mockAgent = { chat: jest.fn().mockResolvedValue({ response: 'ok' }) };
      const wrapper = createAgentWrapper('companion', 'Companion', mockAgent);
      await wrapper.execute(makeRequest({ input: { query: 'test query' } }));

      expect(mockAgent.chat).toHaveBeenCalledWith('test-user', 'test query', expect.anything());
    });

    it('should extract query from input.message when query is missing', async () => {
      const mockAgent = { chat: jest.fn().mockResolvedValue({ response: 'ok' }) };
      const wrapper = createAgentWrapper('companion', 'Companion', mockAgent);
      await wrapper.execute(makeRequest({ input: { message: 'hello there' } }));

      expect(mockAgent.chat).toHaveBeenCalledWith('test-user', 'hello there', expect.anything());
    });

    it('should handle undefined input gracefully', async () => {
      const mockAgent = { chat: jest.fn().mockResolvedValue({ response: 'ok' }) };
      const wrapper = createAgentWrapper('companion', 'Companion', mockAgent);
      await wrapper.execute(makeRequest({ input: undefined }));

      expect(mockAgent.chat).toHaveBeenCalledWith('test-user', '', expect.anything());
    });
  });
});
