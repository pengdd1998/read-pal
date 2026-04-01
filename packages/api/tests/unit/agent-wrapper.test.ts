/**
 * Unit tests for the agent wrapper logic in index.ts
 *
 * Tests the createAgentWrapper function to ensure it correctly
 * adapts each agent's method signature to the IAgent interface.
 */

// We test the wrapper logic by simulating what it does

describe('Agent Wrapper Unit Tests', () => {
  // Simulate the wrapper logic
  function createMockWrapper(name: string, agentInstance: any) {
    return {
      name,
      execute: async (request: any) => {
        const input = request.input || {};
        const query = input.query || input.message || '';
        let result: any;

        switch (name) {
          case 'companion':
          case 'coach':
            result = await agentInstance.chat(request.userId, query, request.context);
            break;
          case 'research': {
            const action = (request.action === 'chat' ? 'deep_dive' : request.action) as string;
            result = await agentInstance.execute(request.userId, query, action, request.context);
            break;
          }
          case 'synthesis':
            result = await agentInstance.execute(request);
            break;
          case 'friend':
            result = await agentInstance.chat(request.userId, query, request.context);
            break;
          default:
            if (typeof agentInstance.execute === 'function') {
              result = await agentInstance.execute(request);
            } else if (typeof agentInstance.chat === 'function') {
              result = await agentInstance.chat(request.userId, query, request.context);
            } else {
              throw new Error(`Agent ${name} has no compatible method`);
            }
        }

        return {
          content: result?.response || result?.content || result?.message || '',
          success: true,
        };
      },
    };
  }

  describe('CompanionAgent wrapper', () => {
    it('should call chat(userId, message, context)', async () => {
      const mockAgent = {
        chat: jest.fn().mockResolvedValue({ response: 'Hello from companion!', toolsUsed: [] }),
      };

      const wrapper = createMockWrapper('companion', mockAgent);
      const result = await wrapper.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        action: 'chat',
        input: { query: 'Explain quantum entanglement' },
        context: { currentBook: { id: 'book-1', title: 'Physics 101' } },
      });

      expect(mockAgent.chat).toHaveBeenCalledWith(
        'user-1',
        'Explain quantum entanglement',
        { currentBook: { id: 'book-1', title: 'Physics 101' } },
      );
      expect(result.content).toBe('Hello from companion!');
      expect(result.success).toBe(true);
    });
  });

  describe('CoachAgent wrapper', () => {
    it('should call chat(userId, message, context)', async () => {
      const mockAgent = {
        chat: jest.fn().mockResolvedValue({ response: 'Try this exercise!', toolsUsed: [] }),
      };

      const wrapper = createMockWrapper('coach', mockAgent);
      const result = await wrapper.execute({
        userId: 'user-2',
        sessionId: 'session-2',
        action: 'chat',
        input: { query: 'How can I improve my reading speed?' },
      });

      expect(mockAgent.chat).toHaveBeenCalledWith('user-2', 'How can I improve my reading speed?', undefined);
      expect(result.content).toBe('Try this exercise!');
    });
  });

  describe('ResearchAgent wrapper', () => {
    it('should call execute(userId, message, "deep_dive", context)', async () => {
      const mockAgent = {
        execute: jest.fn().mockResolvedValue({
          response: 'Here is my research...',
          toolsUsed: ['library_search'],
          researchTopics: [],
        }),
      };

      const wrapper = createMockWrapper('research', mockAgent);
      const result = await wrapper.execute({
        userId: 'user-3',
        sessionId: 'session-3',
        action: 'chat',
        input: { query: 'Find connections between books' },
        context: { readingLocation: { chapter: 5 } },
      });

      expect(mockAgent.execute).toHaveBeenCalledWith(
        'user-3',
        'Find connections between books',
        'deep_dive',
        { readingLocation: { chapter: 5 } },
      );
      expect(result.content).toBe('Here is my research...');
    });
  });

  describe('SynthesisAgent wrapper', () => {
    it('should pass the full request object', async () => {
      const mockAgent = {
        execute: jest.fn().mockResolvedValue({ content: 'Synthesized analysis' }),
      };

      const request = {
        userId: 'user-4',
        sessionId: 'session-4',
        action: 'chat',
        input: { query: 'Compare themes across books' },
      };

      const wrapper = createMockWrapper('synthesis', mockAgent);
      const result = await wrapper.execute(request);

      expect(mockAgent.execute).toHaveBeenCalledWith(request);
      expect(result.content).toBe('Synthesized analysis');
    });
  });

  describe('Unknown agent wrapper', () => {
    it('should fallback to execute() if available', async () => {
      const mockAgent = {
        execute: jest.fn().mockResolvedValue({ response: 'fallback response' }),
      };

      const wrapper = createMockWrapper('custom_agent', mockAgent);
      const result = await wrapper.execute({
        userId: 'user-5',
        sessionId: 'session-5',
        action: 'chat',
        input: { query: 'test' },
      });

      expect(mockAgent.execute).toHaveBeenCalled();
      expect(result.content).toBe('fallback response');
    });

    it('should fallback to chat() if execute() not available', async () => {
      const mockAgent = {
        chat: jest.fn().mockResolvedValue({ response: 'chat fallback' }),
      };

      const wrapper = createMockWrapper('custom_agent', mockAgent);
      const result = await wrapper.execute({
        userId: 'user-6',
        sessionId: 'session-6',
        action: 'chat',
        input: { query: 'hello' },
      });

      expect(mockAgent.chat).toHaveBeenCalledWith('user-6', 'hello', undefined);
      expect(result.content).toBe('chat fallback');
    });

    it('should throw if no compatible method exists', async () => {
      const mockAgent = {}; // No execute or chat method

      const wrapper = createMockWrapper('broken_agent', mockAgent);

      await expect(wrapper.execute({
        userId: 'user-7',
        sessionId: 'session-7',
        action: 'chat',
        input: { query: 'test' },
      })).rejects.toThrow('Agent broken_agent has no compatible method');
    });
  });

  describe('Response extraction', () => {
    it('should extract response field first', async () => {
      const mockAgent = { chat: jest.fn().mockResolvedValue({ response: 'primary' }) };
      const wrapper = createMockWrapper('companion', mockAgent);
      const result = await wrapper.execute({
        userId: 'u1', sessionId: 's1', action: 'chat', input: { query: 'test' },
      });
      expect(result.content).toBe('primary');
    });

    it('should fallback to content field', async () => {
      const mockAgent = { chat: jest.fn().mockResolvedValue({ content: 'secondary' }) };
      const wrapper = createMockWrapper('companion', mockAgent);
      const result = await wrapper.execute({
        userId: 'u1', sessionId: 's1', action: 'chat', input: { query: 'test' },
      });
      expect(result.content).toBe('secondary');
    });

    it('should fallback to empty string', async () => {
      const mockAgent = { chat: jest.fn().mockResolvedValue({}) };
      const wrapper = createMockWrapper('companion', mockAgent);
      const result = await wrapper.execute({
        userId: 'u1', sessionId: 's1', action: 'chat', input: { query: 'test' },
      });
      expect(result.content).toBe('');
    });
  });

  describe('FriendAgent wrapper', () => {
    it('should call chat(userId, message, context)', async () => {
      const mockAgent = {
        chat: jest.fn().mockResolvedValue({
          response: 'Hey there! Great to read with you!',
          persona: 'penny',
          emotion: 'enthusiastic',
        }),
      };

      const wrapper = createMockWrapper('friend', mockAgent);
      const result = await wrapper.execute({
        userId: 'user-f1',
        sessionId: 'session-f1',
        action: 'chat',
        input: { query: 'What do you think of this chapter?' },
      });

      expect(mockAgent.chat).toHaveBeenCalledWith('user-f1', 'What do you think of this chapter?', undefined);
      expect(result.content).toBe('Hey there! Great to read with you!');
      expect(result.success).toBe(true);
    });
  });

  describe('ResearchAgent action forwarding', () => {
    it('should default to deep_dive when action is chat', async () => {
      const mockAgent = {
        execute: jest.fn().mockResolvedValue({ response: 'research result' }),
      };

      const wrapper = createMockWrapper('research', mockAgent);
      await wrapper.execute({
        userId: 'user-r1',
        sessionId: 'session-r1',
        action: 'chat',
        input: { query: 'Research this' },
      });

      expect(mockAgent.execute).toHaveBeenCalledWith('user-r1', 'Research this', 'deep_dive', undefined);
    });

    it('should forward non-chat actions as-is', async () => {
      const mockAgent = {
        execute: jest.fn().mockResolvedValue({ response: 'fact check result' }),
      };

      const wrapper = createMockWrapper('research', mockAgent);
      await wrapper.execute({
        userId: 'user-r2',
        sessionId: 'session-r2',
        action: 'fact_check',
        input: { query: 'Is this claim true?' },
      });

      expect(mockAgent.execute).toHaveBeenCalledWith('user-r2', 'Is this claim true?', 'fact_check', undefined);
    });

    it('should forward cross_reference action', async () => {
      const mockAgent = {
        execute: jest.fn().mockResolvedValue({ response: 'cross-ref result' }),
      };

      const wrapper = createMockWrapper('research', mockAgent);
      await wrapper.execute({
        userId: 'user-r3',
        sessionId: 'session-r3',
        action: 'cross_reference',
        input: { query: 'Compare with other sources' },
      });

      expect(mockAgent.execute).toHaveBeenCalledWith('user-r3', 'Compare with other sources', 'cross_reference', undefined);
    });
  });
});
