/**
 * Unit tests for AgentOrchestrator
 *
 * Tests the multi-agent orchestrator that coordinates between
 * Companion, Research, Coach, Synthesis, and Friend agents.
 * Covers: query routing, companion always included, parallel vs
 * sequential execution, error handling, config validation.
 */

import {
  AgentOrchestrator,
  OrchestratorConfig,
  OrchestratorRequest,
  OrchestratorResponse,
} from '../AgentOrchestrator';
import type {
  IAgent,
  AgentResponse,
  AgentError,
  Logger,
} from '../../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createMockAgent(
  name: string,
  responseOverride?: Partial<AgentResponse>
): IAgent {
  return {
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1) + ' Agent',
    version: '1.0.0',
    purpose: `Purpose for ${name}`,
    responsibilities: [],
    model: 'glm-4.7-flash',
    systemPrompt: '',
    tools: [],
    memoryType: 'session',
    interventionStyle: 'reactive',
    execute: jest.fn().mockResolvedValue({
      success: true,
      content: `Response from ${name}`,
      metadata: {
        modelUsed: 'glm-4.7-flash',
        tokensUsed: 50,
        cost: 0.001,
        duration: 100,
      },
      ...responseOverride,
    } as AgentResponse),
  };
}

function buildAgentMap(agentNames: string[]): Map<string, IAgent> {
  const map = new Map<string, IAgent>();
  for (const name of agentNames) {
    map.set(name, createMockAgent(name));
  }
  return map;
}

function buildConfig(agentNames: string[], defaultAgent = 'companion'): OrchestratorConfig {
  return {
    agents: buildAgentMap(agentNames),
    defaultAgent,
  };
}

function buildRequest(overrides?: Partial<OrchestratorRequest>): OrchestratorRequest {
  return {
    userId: 'user-1',
    sessionId: 'session-1',
    query: 'Tell me about this chapter',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentOrchestrator', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  // -------------------------------------------------------------------------
  // Configuration validation
  // -------------------------------------------------------------------------

  describe('constructor - config validation', () => {
    it('should throw if no default agent is specified', () => {
      expect(() => {
        new AgentOrchestrator(
          { agents: new Map(), defaultAgent: '' },
          logger
        );
      }).toThrow('Orchestrator requires a default agent');
    });

    it('should throw if default agent is not in the agent map', () => {
      const agents = buildAgentMap(['research']);
      expect(() => {
        new AgentOrchestrator(
          { agents, defaultAgent: 'companion' },
          logger
        );
      }).toThrow('Default agent not found: companion');
    });

    it('should throw if agent map is empty', () => {
      expect(() => {
        new AgentOrchestrator(
          { agents: new Map(), defaultAgent: 'companion' },
          logger
        );
      }).toThrow();
    });

    it('should succeed with valid configuration', () => {
      const config = buildConfig(['companion']);
      expect(() => {
        new AgentOrchestrator(config, logger);
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Query routing - companion always included
  // -------------------------------------------------------------------------

  describe('query routing - companion always included', () => {
    it('should always include companion agent for any query', async () => {
      const config = buildConfig(['companion', 'research', 'coach', 'synthesis']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Hello there',
      }));

      expect(response.success).toBe(true);
      expect(response.agentsUsed.some(e => e.agentName === 'companion')).toBe(true);
    });

    it('should include companion even for research-oriented queries', async () => {
      const config = buildConfig(['companion', 'research']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Search for information about machine learning',
      }));

      expect(response.agentsUsed.some(e => e.agentName === 'companion')).toBe(true);
      expect(response.agentsUsed.some(e => e.agentName === 'research')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Query routing - correct agent selection
  // -------------------------------------------------------------------------

  describe('query routing - keyword-based agent selection', () => {
    it('should route to research agent for search-related queries', async () => {
      const config = buildConfig(['companion', 'research']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Find other books I have read about this topic',
      }));

      expect(response.agentsUsed.some(e => e.agentName === 'research')).toBe(true);
    });

    it('should route to coach agent for comprehension queries', async () => {
      const config = buildConfig(['companion', 'coach']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'I am confused about this section, can you help me understand?',
      }));

      expect(response.agentsUsed.some(e => e.agentName === 'coach')).toBe(true);
    });

    it('should route to synthesis agent for comparison queries', async () => {
      const config = buildConfig(['companion', 'synthesis']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Compare the themes across multiple books',
      }));

      expect(response.agentsUsed.some(e => e.agentName === 'synthesis')).toBe(true);
    });

    it('should route to research agent for verification queries', async () => {
      const config = buildConfig(['companion', 'research']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Is this claim accurate? Verify it for me.',
      }));

      expect(response.agentsUsed.some(e => e.agentName === 'research')).toBe(true);
    });

    it('should route to coach agent for goal-related queries', async () => {
      const config = buildConfig(['companion', 'coach']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'How can I improve my reading speed?',
      }));

      expect(response.agentsUsed.some(e => e.agentName === 'coach')).toBe(true);
    });

    it('should route to multiple agents for complex queries', async () => {
      const config = buildConfig(['companion', 'research', 'coach']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Search for related content and help me understand this concept',
      }));

      const agentNames = response.agentsUsed.map(e => e.agentName);
      expect(agentNames).toContain('companion');
      expect(agentNames).toContain('research');
      expect(agentNames).toContain('coach');
    });

    it('should fall back to default agent when no keywords match', async () => {
      const config = buildConfig(['companion']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'xyzzy nonsense words that match nothing',
      }));

      // Companion is always included, so it becomes the fallback too
      expect(response.agentsUsed.length).toBeGreaterThanOrEqual(1);
      expect(response.agentsUsed.some(e => e.agentName === 'companion')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Forced specific agent
  // -------------------------------------------------------------------------

  describe('forced specific agent via options', () => {
    it('should use only the specified agent when options.agent is set', async () => {
      const config = buildConfig(['companion', 'research', 'coach']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Search for things',
        options: { agent: 'research' },
      }));

      expect(response.agentsUsed.length).toBe(1);
      expect(response.agentsUsed[0].agentName).toBe('research');
    });

    it('should throw if the specified agent does not exist', async () => {
      const config = buildConfig(['companion']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'test',
        options: { agent: 'nonexistent_agent' },
      }));

      // The orchestrator catches the error and returns a failed response
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error!.message).toContain('Agent not found');
    });
  });

  // -------------------------------------------------------------------------
  // Parallel execution
  // -------------------------------------------------------------------------

  describe('parallel execution', () => {
    it('should execute agents in parallel when options.parallel is true', async () => {
      const config = buildConfig(['companion', 'research', 'coach']);
      const orchestrator = new AgentOrchestrator(config, logger);

      // Use a query that triggers companion + research + coach
      const response = await orchestrator.process(buildRequest({
        query: 'Search for related content and help me understand this concept',
        options: { parallel: true },
      }));

      expect(response.success).toBe(true);
      expect(response.agentsUsed.length).toBeGreaterThanOrEqual(2);

      // All agents at the same dependency level should have been called
      const loggerInfo = logger.info as jest.Mock;
      expect(loggerInfo).toHaveBeenCalled();
    });

    it('should default to sequential execution when parallel is not specified', async () => {
      const config = buildConfig(['companion', 'research']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Search for something',
      }));

      expect(response.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should return a failed response when an agent throws', async () => {
      const failingAgent = createMockAgent('companion');
      (failingAgent.execute as jest.Mock).mockRejectedValue(
        new Error('Agent crashed')
      );

      const agents = new Map<string, IAgent>();
      agents.set('companion', failingAgent);

      const orchestrator = new AgentOrchestrator(
        { agents, defaultAgent: 'companion' },
        logger
      );

      const response = await orchestrator.process(buildRequest({
        query: 'test query',
      }));

      // The orchestrator should handle the error gracefully
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe('ALL_AGENTS_FAILED');
    });

    it('should continue with other agents if one fails', async () => {
      const failingAgent = createMockAgent('research');
      (failingAgent.execute as jest.Mock).mockRejectedValue(
        new Error('Research agent down')
      );

      const agents = new Map<string, IAgent>();
      agents.set('companion', createMockAgent('companion'));
      agents.set('research', failingAgent);

      const orchestrator = new AgentOrchestrator(
        { agents, defaultAgent: 'companion' },
        logger
      );

      const response = await orchestrator.process(buildRequest({
        query: 'Search for related content',
      }));

      // Companion should succeed even though research failed
      expect(response.success).toBe(true);
      expect(response.agentsUsed.some(e => e.agentName === 'companion' && e.success)).toBe(true);
      expect(response.agentsUsed.some(e => e.agentName === 'research' && !e.success)).toBe(true);
    });

    it('should handle agent execution timeout', async () => {
      const slowAgent = createMockAgent('companion');
      (slowAgent.execute as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          success: true,
          content: 'slow response',
        }), 5000))
      );

      const agents = new Map<string, IAgent>();
      agents.set('companion', slowAgent);

      const orchestrator = new AgentOrchestrator(
        { agents, defaultAgent: 'companion' },
        logger
      );

      const response = await orchestrator.process(buildRequest({
        query: 'test',
        options: { timeout: 100 }, // 100ms timeout
      }));

      // Should fail due to timeout
      expect(response.success).toBe(false);
    });

    it('should handle agent not found during execution', async () => {
      const config = buildConfig(['companion']);
      const orchestrator = new AgentOrchestrator(config, logger);

      // Manually remove the agent after construction to simulate not found
      orchestrator.removeAgent('companion');

      // Add a different agent so the orchestrator doesn't throw on construction
      // (this test is tricky — we need to test the execution path)
      // Instead, let's use the forced agent option with a non-existent agent
      const response = await orchestrator.process(buildRequest({
        query: 'test',
        options: { agent: 'companion' },
      }));

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Synthesis of multiple responses
  // -------------------------------------------------------------------------

  describe('result synthesis', () => {
    it('should return single agent response directly when only one succeeds', async () => {
      const config = buildConfig(['companion']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Tell me something',
      }));

      expect(response.success).toBe(true);
      expect(response.content).toBe('Response from companion');
    });

    it('should synthesize responses when multiple agents succeed', async () => {
      const config = buildConfig(['companion', 'research']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Search for related books',
      }));

      expect(response.success).toBe(true);
      // Should contain companion response and research additional info
      expect(response.content).toContain('Response from companion');
      expect(response.content).toContain('Additional Information');
    });

    it('should include metadata with total tokens and cost', async () => {
      const config = buildConfig(['companion', 'research']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        query: 'Search for something',
      }));

      expect(response.metadata).toBeDefined();
      expect(response.metadata.totalTokens).toBeGreaterThan(0);
      expect(response.metadata.totalCost).toBeGreaterThan(0);
      expect(response.metadata.requestId).toBeDefined();
      expect(response.metadata.totalDuration).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // Agent management
  // -------------------------------------------------------------------------

  describe('agent management', () => {
    it('should add an agent dynamically', () => {
      const config = buildConfig(['companion']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const newAgent = createMockAgent('research');
      orchestrator.addAgent(newAgent);

      expect(orchestrator.getAgent('research')).toBeDefined();
      expect(orchestrator.getAgents().length).toBe(2);
    });

    it('should remove an agent dynamically', () => {
      const config = buildConfig(['companion', 'research']);
      const orchestrator = new AgentOrchestrator(config, logger);

      orchestrator.removeAgent('research');
      expect(orchestrator.getAgent('research')).toBeUndefined();
      expect(orchestrator.getAgents().length).toBe(1);
    });

    it('should list all registered agents', () => {
      const config = buildConfig(['companion', 'research', 'coach']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const agents = orchestrator.getAgents();
      expect(agents.length).toBe(3);
      const names = agents.map(a => a.name);
      expect(names).toContain('companion');
      expect(names).toContain('research');
      expect(names).toContain('coach');
    });

    it('should get a specific agent by name', () => {
      const config = buildConfig(['companion', 'research']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const agent = orchestrator.getAgent('research');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('research');
    });

    it('should return undefined for non-existent agent', () => {
      const config = buildConfig(['companion']);
      const orchestrator = new AgentOrchestrator(config, logger);

      expect(orchestrator.getAgent('nonexistent')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Max agents limit
  // -------------------------------------------------------------------------

  describe('max agents limit', () => {
    it('should limit the number of agents when maxAgents is set', async () => {
      const config = buildConfig(['companion', 'research', 'coach', 'synthesis']);
      const orchestrator = new AgentOrchestrator(config, logger);

      const response = await orchestrator.process(buildRequest({
        // Query that would match companion + research + coach + synthesis
        query: 'Search, compare, and help me understand across multiple sources',
        options: { maxAgents: 2 },
      }));

      expect(response.agentsUsed.length).toBeLessThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // Logging
  // -------------------------------------------------------------------------

  describe('logging', () => {
    it('should log request processing start and completion', async () => {
      const config = buildConfig(['companion']);
      const orchestrator = new AgentOrchestrator(config, logger);

      await orchestrator.process(buildRequest({ query: 'hello' }));

      const infoCalls = (logger.info as jest.Mock).mock.calls;
      const startLog = infoCalls.find(
        (call: any[]) => call[0] === 'Processing orchestrator request'
      );
      const endLog = infoCalls.find(
        (call: any[]) => call[0] === 'Orchestrator request completed'
      );

      expect(startLog).toBeDefined();
      expect(endLog).toBeDefined();
    });

    it('should log errors when processing fails', async () => {
      const failingAgent = createMockAgent('companion');
      (failingAgent.execute as jest.Mock).mockRejectedValue(new Error('boom'));

      const agents = new Map<string, IAgent>();
      agents.set('companion', failingAgent);

      const orchestrator = new AgentOrchestrator(
        { agents, defaultAgent: 'companion' },
        logger
      );

      await orchestrator.process(buildRequest({ query: 'test' }));

      expect(logger.error as jest.Mock).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Dependency-based execution order
  // -------------------------------------------------------------------------

  describe('execution order with dependencies', () => {
    it('should run synthesis after research and companion (dependency ordering)', async () => {
      const callOrder: string[] = [];

      const makeOrderedAgent = (name: string): IAgent => {
        const agent = createMockAgent(name);
        (agent.execute as jest.Mock).mockImplementation(async () => {
          callOrder.push(name);
          return {
            success: true,
            content: `Response from ${name}`,
            metadata: {
              modelUsed: 'glm-4.7-flash',
              tokensUsed: 10,
              cost: 0.001,
              duration: 50,
            },
          };
        });
        return agent;
      };

      const agents = new Map<string, IAgent>();
      agents.set('companion', makeOrderedAgent('companion'));
      agents.set('research', makeOrderedAgent('research'));
      agents.set('synthesis', makeOrderedAgent('synthesis'));

      const orchestrator = new AgentOrchestrator(
        { agents, defaultAgent: 'companion' },
        logger
      );

      await orchestrator.process(buildRequest({
        query: 'Search for information and compare across multiple sources',
      }));

      // Companion and research should come before synthesis
      const companionIdx = callOrder.indexOf('companion');
      const researchIdx = callOrder.indexOf('research');
      const synthesisIdx = callOrder.indexOf('synthesis');

      expect(companionIdx).toBeLessThan(synthesisIdx);
      expect(researchIdx).toBeLessThan(synthesisIdx);
    });
  });
});
