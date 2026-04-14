/**
 * Unit tests for SynthesisAgent.ts
 *
 * Tests the cross-document analysis and knowledge synthesis agent.
 * Covers: all 5 actions, request validation, library search integration,
 * conversation history, error handling, config defaults, response parsing.
 *
 * All external deps (llmClient, LibrarySearchTool) are mocked.
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

import { SynthesisAgent } from '../SynthesisAgent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock library search result */
function mockSearchResult(overrides: {
  id?: string;
  title?: string;
  author?: string;
  relevance?: number;
  description?: string;
} = {}) {
  return {
    document: {
      id: overrides.id || `book-${Math.random().toString(36).slice(2, 8)}`,
      title: overrides.title || 'Test Book',
      author: overrides.author || 'Test Author',
      type: 'book',
      metadata: overrides.description
        ? { description: overrides.description }
        : {},
    },
    score: 0.9,
    relevance: overrides.relevance ?? 0.85,
  };
}

/** Build a valid AgentRequest with defaults */
function makeRequest(overrides: {
  userId?: string;
  action?: string;
  input: unknown;
  context?: unknown;
}) {
  return {
    userId: overrides.userId ?? 'user-1',
    sessionId: 'test-session',
    action: overrides.action ?? 'synthesize',
    input: overrides.input,
    context: overrides.context as undefined,
  };
}

/** Standard search results for reuse */
function defaultSearchResults() {
  return {
    results: [
      mockSearchResult({ id: 'book-1', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', relevance: 0.92 }),
      mockSearchResult({ id: 'book-2', title: 'Predictably Irrational', author: 'Dan Ariely', relevance: 0.87 }),
      mockSearchResult({ id: 'book-3', title: 'Nudge', author: 'Richard Thaler', relevance: 0.75 }),
    ],
    total: 3,
    query: 'cognitive biases',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SynthesisAgent', () => {
  let agent: SynthesisAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChatCompletion.mockResolvedValue('AI synthesis response text');
    mockLibraryExecute.mockResolvedValue({
      success: true,
      data: defaultSearchResults(),
    });
    agent = new SynthesisAgent();
  });

  // =========================================================================
  // Constructor & Config
  // =========================================================================

  describe('constructor', () => {
    it('should use default config values when no config provided', () => {
      const defaultAgent = new SynthesisAgent();
      expect(defaultAgent).toBeDefined();
      expect(defaultAgent.getSupportedActions()).toEqual([
        'synthesize',
        'cross_reference',
        'concept_map',
        'find_contradictions',
        'summary_report',
      ]);
    });

    it('should accept custom model config', async () => {
      const customAgent = new SynthesisAgent({
        model: 'glm-4-plus',
        maxTokens: 2048,
        temperature: 0.3,
      });

      mockChatCompletion.mockResolvedValue('custom response');

      await customAgent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'glm-4-plus',
          maxTokens: 2048,
          temperature: 0.3,
        }),
      );
    });

    it('should register library_search tool by default', () => {
      // Agent can perform library searches — verified via synthesize action
      expect(agent).toBeDefined();
    });
  });

  // =========================================================================
  // Static properties
  // =========================================================================

  describe('ACTIONS', () => {
    it('should list all 5 supported actions', () => {
      expect(SynthesisAgent.ACTIONS).toEqual([
        'synthesize',
        'cross_reference',
        'concept_map',
        'find_contradictions',
        'summary_report',
      ]);
    });

    it('should be accessible via getSupportedActions', () => {
      const actions = agent.getSupportedActions();
      expect(actions).toHaveLength(5);
      expect(actions).toContain('synthesize');
      expect(actions).toContain('cross_reference');
      expect(actions).toContain('concept_map');
      expect(actions).toContain('find_contradictions');
      expect(actions).toContain('summary_report');
    });
  });

  // =========================================================================
  // execute() — Request Validation
  // =========================================================================

  describe('execute — request validation', () => {
    it('should return error when userId is missing', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: '',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_USER_ID');
      expect(result.content).toContain('user ID');
    });

    it('should return error when action is missing', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: '',
        input: { query: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_ACTION');
    });

    it('should return error when input is missing', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: undefined as never,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_INPUT');
    });

    it('should return error for invalid action', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'invalid_action',
        input: { query: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_ACTION');
      expect(result.content).toContain('Invalid action: invalid_action');
      expect(result.content).toContain('synthesize');
    });

    it('should mark validation errors as recoverable', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: '',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.error?.recoverable).toBe(true);
    });
  });

  // =========================================================================
  // execute() — synthesize action
  // =========================================================================

  describe('execute — synthesize', () => {
    it('should return successful result with themes and connections', async () => {
      mockChatCompletion.mockResolvedValue(`
1. **Cognitive Biases**: These affect decision making
2. **System 1 vs System 2**: Two modes of thinking

Both Kahneman and Ariely explore how our minds trick us.
      `);

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'cognitive biases', bookIds: ['book-1', 'book-2'] },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).themes).toBeDefined();
      expect((result.data as any).connections).toBeDefined();
      expect((result.data as any).synthesis).toBeDefined();
      expect(result.metadata?.toolsUsed).toContain('library_search');
    });

    it('should pass depth parameter to search limits', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test', depth: 'brief' },
      });

      // Brief depth should request 5 results
      expect(mockLibraryExecute).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 }),
        expect.anything(),
      );
    });

    it('should request 20 results for deep synthesis', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test', depth: 'deep' },
      });

      expect(mockLibraryExecute).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20 }),
        expect.anything(),
      );
    });

    it('should default to standard depth (10 results)', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(mockLibraryExecute).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
        expect.anything(),
      );
    });

    it('should include theme in prompt when provided', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test', theme: 'decision making' },
      });

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.any(String),
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Theme: decision making'),
            }),
          ]),
        }),
      );
    });

    it('should work when library search returns null', async () => {
      mockLibraryExecute.mockResolvedValue({ success: false });

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.toolsUsed).toEqual([]);
    });

    it('should work when library search throws', async () => {
      mockLibraryExecute.mockRejectedValue(new Error('Pinecone down'));

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.success).toBe(true);
    });

    it('should include context block when context provided', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
        context: {
          currentBook: { id: 'book-1', title: 'Test Book', author: 'Author', type: 'ebook' as const, source: 'upload' as const },
          userUnderstandingLevel: 'advanced',
        },
      });

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Currently reading'),
            }),
          ]),
        }),
      );
    });
  });

  // =========================================================================
  // execute() — cross_reference action
  // =========================================================================

  describe('execute — cross_reference', () => {
    it('should return cross-reference result with references', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'cross_reference',
        input: {
          concept: 'heuristics',
          sourceBookId: 'book-1',
        },
      });

      expect(result.success).toBe(true);
      expect((result.data as any).concept).toBe('heuristics');
      expect((result.data as any).source).toBeDefined();
      expect((result.data as any).references).toBeDefined();
      expect((result.data as any).analysis).toBeDefined();
      expect(result.metadata?.toolsUsed).toContain('library_search');
    });

    it('should search excluding source book', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'cross_reference',
        input: {
          concept: 'heuristics',
          sourceBookId: 'book-1',
        },
      });

      // Should have at least 2 calls: one excluding source, one for source
      const firstCall = mockLibraryExecute.mock.calls[0][0];
      expect(firstCall.filters.excludeBookId).toBe('book-1');
    });

    it('should respect targetBookIds filter', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'cross_reference',
        input: {
          concept: 'heuristics',
          sourceBookId: 'book-1',
          targetBookIds: ['book-2', 'book-3'],
        },
      });

      const firstCall = mockLibraryExecute.mock.calls[0][0];
      expect(firstCall.filters.bookIds).toEqual(['book-2', 'book-3']);
    });

    it('should default analysisType to "all"', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'cross_reference',
        input: {
          concept: 'heuristics',
          sourceBookId: 'book-1',
        },
      });

      expect(result.success).toBe(true);
      // With 'all' analysisType, references should get 'nuancing' type
      if ((result.data as any).references?.length > 0) {
        expect((result.data as any).references[0].type).toBe('nuancing');
      }
    });

    it('should use specified analysisType for references', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'cross_reference',
        input: {
          concept: 'heuristics',
          sourceBookId: 'book-1',
          analysisType: 'supporting',
        },
      });

      expect(result.success).toBe(true);
      if ((result.data as any).references?.length > 0) {
        expect((result.data as any).references[0].type).toBe('supporting');
      }
    });

    it('should build source passage from search results', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'cross_reference',
        input: {
          concept: 'heuristics',
          sourceBookId: 'book-1',
        },
      });

      expect((result.data as any).source.bookId).toBe('book-1');
    });
  });

  // =========================================================================
  // execute() — concept_map action
  // =========================================================================

  describe('execute — concept_map', () => {
    it('should return concept map with nodes and edges', async () => {
      mockChatCompletion.mockResolvedValue(`
SUMMARY:
This is a concept map about cognitive biases.

NODES:
[{"id": "n1", "label": "Cognitive Bias", "type": "concept", "weight": 0.9},
 {"id": "n2", "label": "Thinking, Fast and Slow", "type": "book", "weight": 0.8}]

EDGES:
[{"source": "n1", "target": "n2", "label": "discussed in", "strength": 0.7}]
      `);

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'concept_map',
        input: { topic: 'cognitive biases' },
      });

      expect(result.success).toBe(true);
      expect((result.data as any).nodes).toBeDefined();
      expect((result.data as any).edges).toBeDefined();
      expect((result.data as any).summary).toBeDefined();
      expect((result.data as any).nodes.length).toBeGreaterThan(0);
      expect((result.data as any).edges.length).toBeGreaterThan(0);
    });

    it('should respect maxNodes limit', async () => {
      const manyNodes = Array.from({ length: 30 }, (_, i) => ({
        id: `n${i}`,
        label: `Concept ${i}`,
        type: 'concept',
        weight: 0.5,
      }));
      const edges = Array.from({ length: 5 }, (_, i) => ({
        source: `n${i}`,
        target: `n${i + 1}`,
        label: 'related',
        strength: 0.5,
      }));

      mockChatCompletion.mockResolvedValue(`
SUMMARY: Test map

NODES:
${JSON.stringify(manyNodes)}

EDGES:
${JSON.stringify(edges)}
      `);

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'concept_map',
        input: { topic: 'test', maxNodes: 10 },
      });

      expect((result.data as any).nodes.length).toBeLessThanOrEqual(10);
    });

    it('should handle unparseable LLM response gracefully', async () => {
      mockChatCompletion.mockResolvedValue(
        'Just some random text without structured data',
      );

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'concept_map',
        input: { topic: 'test' },
      });

      expect(result.success).toBe(true);
      // Should still return something, even if parsed from fallback
      expect(result.data).toBeDefined();
    });

    it('should default maxNodes to 20', async () => {
      mockChatCompletion.mockResolvedValue('SUMMARY: test\nNODES:\n[]\n\nEDGES:\n[]');

      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'concept_map',
        input: { topic: 'test' },
      });

      // Verify the prompt mentions max 20 nodes
      const callArgs = mockChatCompletion.mock.calls[0][0];
      const lastMsg = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMsg.content).toContain('20 nodes');
    });
  });

  // =========================================================================
  // execute() — find_contradictions action
  // =========================================================================

  describe('execute — find_contradictions', () => {
    it('should return contradictions analysis', async () => {
      mockChatCompletion.mockResolvedValue(`
1. **On Rationality**: Kahneman argues that humans are fundamentally irrational.
   Ariely disagrees, suggesting rationality is context-dependent.
   This is a significant disagreement about human nature.

2. **On Nudging**: Thaler sees nudging as helpful.
   This extends the discussion.
      `);

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'find_contradictions',
        input: { topic: 'rationality' },
      });

      expect(result.success).toBe(true);
      expect((result.data as any).contradictions).toBeDefined();
      expect((result.data as any).analysis).toBeDefined();
    });

    it('should use topic-specific search query when topic provided', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'find_contradictions',
        input: { topic: 'free will' },
      });

      const searchCall = mockLibraryExecute.mock.calls[0][0];
      expect(searchCall.query).toContain('free will');
      expect(searchCall.query).toContain('differing perspectives');
    });

    it('should use generic query when no topic provided', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'find_contradictions',
        input: {},
      });

      const searchCall = mockLibraryExecute.mock.calls[0][0];
      expect(searchCall.query).toContain('contradicting perspectives');
    });

    it('should filter contradictions by minSeverity', async () => {
      mockChatCompletion.mockResolvedValue(`
1. A minor difference in emphasis. Not very significant.
2. Authors fundamentally disagree on this core claim.
      `);

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'find_contradictions',
        input: { topic: 'test', minSeverity: 'high' },
      });

      expect(result.success).toBe(true);
      // High-severity filter should exclude low-severity items
      const contradictions = (result.data as any).contradictions || [];
      for (const c of contradictions) {
        expect(['high']).toContain(c.severity);
      }
    });

    it('should default minSeverity to "medium"', async () => {
      mockChatCompletion.mockResolvedValue('No contradictions found.');

      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'find_contradictions',
        input: { topic: 'test' },
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const lastMsg = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMsg.content).toContain('medium');
    });
  });

  // =========================================================================
  // execute() — summary_report action
  // =========================================================================

  describe('execute — summary_report', () => {
    it('should return summary report with themes and insights', async () => {
      mockChatCompletion.mockResolvedValue(`
## Intellectual Landscape

This report reveals several key themes across your reading.

### Key Themes
1. **Decision Making**: Multiple authors explore how we choose
2. **Behavioral Economics**: The intersection of psychology and economics

### Insights
- Kahneman reveals that System 1 thinking dominates daily decisions
- Ariely demonstrates how predictable our irrational behavior is
- Thaler suggests that choice architecture significantly impacts outcomes

This synthesis shows the remarkable convergence of behavioral science.
      `);

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'summary_report',
        input: {},
      });

      expect(result.success).toBe(true);
      expect((result.data as any).report).toBeDefined();
      expect((result.data as any).themes).toBeDefined();
      expect((result.data as any).booksCovered).toBeGreaterThan(0);
      expect((result.data as any).insights).toBeDefined();
    });

    it('should use focus area in search query when provided', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'summary_report',
        input: { focus: 'decision theory' },
      });

      const searchCall = mockLibraryExecute.mock.calls[0][0];
      expect(searchCall.query).toBe('decision theory');
    });

    it('should default to broad search query', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'summary_report',
        input: {},
      });

      const searchCall = mockLibraryExecute.mock.calls[0][0];
      expect(searchCall.query).toContain('main ideas');
    });

    it('should pass format instruction in prompt', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'summary_report',
        input: { format: 'academic' },
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const lastMsg = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMsg.content).toContain('academic');
    });

    it('should include time range in prompt when provided', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'summary_report',
        input: { timeRange: { start: '2025-01-01', end: '2025-12-31' } },
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const lastMsg = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMsg.content).toContain('2025-01-01');
      expect(lastMsg.content).toContain('2025-12-31');
    });

    it('should count books covered from search results', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'summary_report',
        input: {},
      });

      // defaultSearchResults() returns 3 results
      expect((result.data as any).booksCovered).toBe(3);
    });

    it('should handle zero search results', async () => {
      mockLibraryExecute.mockResolvedValue({
        success: true,
        data: { results: [], total: 0, query: 'test' },
      });

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'summary_report',
        input: {},
      });

      expect(result.success).toBe(true);
      expect((result.data as any).booksCovered).toBe(0);
    });
  });

  // =========================================================================
  // Conversation History
  // =========================================================================

  describe('conversation history', () => {
    it('should maintain separate histories per user', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test 1' },
      });
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-2',
        action: 'synthesize',
        input: { query: 'test 2' },
      });

      expect(agent.getHistory('user-1')).toHaveLength(2); // user msg + assistant msg
      expect(agent.getHistory('user-2')).toHaveLength(2);
    });

    it('should accumulate history across multiple calls', async () => {
      mockChatCompletion.mockResolvedValue('response 1');
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'first' },
      });

      mockChatCompletion.mockResolvedValue('response 2');
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'second' },
      });

      // 2 chats × 2 messages each = 4
      expect(agent.getHistory('user-1')).toHaveLength(4);
    });

    it('should send history to LLM on subsequent calls', async () => {
      mockChatCompletion.mockResolvedValue('response 1');
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'first' },
      });

      mockChatCompletion.mockClear();
      mockChatCompletion.mockResolvedValue('response 2');

      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'second' },
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      // Should include previous user + assistant messages plus current
      expect(callArgs.messages.length).toBeGreaterThanOrEqual(3);
    });

    it('should trim history to last 16 messages', async () => {
      for (let i = 0; i < 10; i++) {
        mockChatCompletion.mockResolvedValue(`response ${i}`);
        await agent.execute({
          sessionId: 'test-session',
        userId: 'user-1',
          action: 'synthesize',
          input: { query: `question ${i}` },
        });
      }

      // 10 chats × 2 = 20 messages, trimmed to 16
      const history = agent.getHistory('user-1');
      expect(history.length).toBeLessThanOrEqual(16);
    });

    it('should return empty array for unknown user', () => {
      expect(agent.getHistory('unknown-user')).toEqual([]);
    });
  });

  describe('clearHistory', () => {
    it('should clear history for a specific user', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-2',
        action: 'synthesize',
        input: { query: 'test' },
      });

      agent.clearHistory('user-1');

      expect(agent.getHistory('user-1')).toEqual([]);
      // user-2 should be unaffected
      expect(agent.getHistory('user-2')).toHaveLength(2);
    });

    it('should not throw when clearing history for non-existent user', () => {
      expect(() => agent.clearHistory('unknown-user')).not.toThrow();
    });
  });

  // =========================================================================
  // System Prompt
  // =========================================================================

  describe('system prompt', () => {
    it('should include Synthesis Agent identity', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      expect(callArgs.system).toContain('Synthesis Agent');
      expect(callArgs.system).toContain('read-pal');
    });

    it('should include tool descriptions', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      expect(callArgs.system).toContain('library_search');
    });

    it('should include personality guidelines', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      expect(callArgs.system).toContain('Intellectually rigorous');
      expect(callArgs.system).toContain('accessible');
    });

    it('should include constraints', async () => {
      await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      const callArgs = mockChatCompletion.mock.calls[0][0];
      expect(callArgs.system).toContain('Never invent citations');
      expect(callArgs.system).toContain('transparent about confidence');
    });
  });

  // =========================================================================
  // Error Handling
  // =========================================================================

  describe('error handling', () => {
    it('should handle LLM API failure gracefully', async () => {
      mockChatCompletion.mockRejectedValue(new Error('API timeout'));

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.content).toContain('unexpected issue');
    });

    it('should handle API key error', async () => {
      mockChatCompletion.mockRejectedValue(new Error('API key invalid'));

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AUTH_ERROR');
    });

    it('should handle rate limit error', async () => {
      mockChatCompletion.mockRejectedValue(new Error('rate limit exceeded'));

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('RATE_LIMIT');
    });

    it('should handle unknown errors', async () => {
      mockChatCompletion.mockRejectedValue('string error');

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNKNOWN_ERROR');
    });

    it('should include duration in error metadata', async () => {
      mockChatCompletion.mockRejectedValue(new Error('fail'));

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.modelUsed).toBe('glm-4.7-flash');
    });

    it('should mark most runtime errors as recoverable', async () => {
      mockChatCompletion.mockRejectedValue(new Error('transient failure'));

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.error?.recoverable).toBe(true);
    });
  });

  // =========================================================================
  // Response Parsing
  // =========================================================================

  describe('response parsing — extractThemes', () => {
    it('should extract themes from formatted response', async () => {
      mockChatCompletion.mockResolvedValue(`
1. **Cognitive Biases**: Systematic errors in thinking
2. **Decision Theory**: How choices are made under uncertainty
3. **Behavioral Economics**: Psychology meets economics
      `);

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect((result.data as any).themes.length).toBeGreaterThan(0);
      expect((result.data as any).themes[0].name).toBeDefined();
      expect((result.data as any).themes[0].description).toBeDefined();
    });

    it('should limit themes to 10', async () => {
      const manyThemes = Array.from({ length: 15 }, (_, i) =>
        `${i + 1}. **Theme ${i}**: Description for theme ${i}`,
      ).join('\n');

      mockChatCompletion.mockResolvedValue(manyThemes);

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect((result.data as any).themes.length).toBeLessThanOrEqual(10);
    });
  });

  describe('response parsing — extractConnections', () => {
    it('should generate connections from search results', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      // defaultSearchResults has 3 results → should generate connections
      expect((result.data as any).connections.length).toBeGreaterThan(0);
    });

    it('should return empty connections for single result', async () => {
      mockLibraryExecute.mockResolvedValue({
        success: true,
        data: {
          results: [mockSearchResult({ id: 'only-book' })],
          total: 1,
          query: 'test',
        },
      });

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect((result.data as any).connections).toEqual([]);
    });
  });

  describe('response parsing — conceptMap fallback', () => {
    it('should create basic nodes from text when JSON parsing fails', async () => {
      mockChatCompletion.mockResolvedValue(
        'A response with some important concepts about behavioral economics and cognitive psychology.',
      );

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'concept_map',
        input: { topic: 'test' },
      });

      expect(result.success).toBe(true);
      expect((result.data as any).nodes).toBeDefined();
    });
  });

  describe('response parsing — extractInsightsFromReport', () => {
    it('should extract sentences with insight keywords', async () => {
      mockChatCompletion.mockResolvedValue(`
The research reveals important patterns in decision making.
Kahneman demonstrates how System 1 operates automatically.
This is a basic sentence without special keywords.
The data suggests unexpected connections between fields.
      `);

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'summary_report',
        input: {},
      });

      expect((result.data as any).insights.length).toBeGreaterThan(0);
    });

    it('should limit insights to 8', async () => {
      const manyInsights = Array.from({ length: 15 }, (_, i) =>
        `Finding ${i} reveals important patterns in the data`,
      ).join('. ');

      mockChatCompletion.mockResolvedValue(manyInsights);

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'summary_report',
        input: {},
      });

      expect((result.data as any).insights.length).toBeLessThanOrEqual(8);
    });
  });

  // =========================================================================
  // Metadata & Cost
  // =========================================================================

  describe('metadata', () => {
    it('should include model used in metadata', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.metadata?.modelUsed).toBe('glm-4.7-flash');
    });

    it('should include duration in metadata', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include tools used in metadata', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.metadata?.toolsUsed).toContain('library_search');
    });

    it('should estimate cost based on tokens', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.metadata?.cost).toBeGreaterThanOrEqual(0);
    });

    it('should have zero cost on error', async () => {
      mockChatCompletion.mockRejectedValue(new Error('fail'));

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
      });

      expect(result.metadata?.cost).toBe(0);
      expect(result.metadata?.tokensUsed).toBe(0);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle empty query string', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: '' },
      });

      expect(result.success).toBe(true);
    });

    it('should handle very long query', async () => {
      const longQuery = 'a'.repeat(5000);
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: longQuery },
      });

      expect(result.success).toBe(true);
    });

    it('should handle library search returning empty results', async () => {
      mockLibraryExecute.mockResolvedValue({
        success: true,
        data: { results: [], total: 0, query: 'test' },
      });

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'obscure topic xyz123' },
      });

      expect(result.success).toBe(true);
    });

    it('should handle null/undefined context gracefully', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'synthesize',
        input: { query: 'test' },
        context: undefined,
      });

      expect(result.success).toBe(true);
    });

    it('should extract content from analysis field for cross_reference', async () => {
      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'cross_reference',
        input: { concept: 'test', sourceBookId: 'book-1' },
      });

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
    });

    it('should extract content from summary field for concept_map', async () => {
      mockChatCompletion.mockResolvedValue('SUMMARY: A concept map summary\nNODES:\n[]\n\nEDGES:\n[]');

      const result = await agent.execute({
        sessionId: 'test-session',
        userId: 'user-1',
        action: 'concept_map',
        input: { topic: 'test' },
      });

      expect(result.content).toBeDefined();
    });
  });
});
