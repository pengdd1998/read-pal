// ============================================================================
// Types
// ============================================================================

import crypto from 'crypto';

import type {
  IAgent,
  BookReference,
  BookLocation,
  ConversationMessage,
  UserPreferences,
  SharedMemory,
  AgentError,
  AgentResponse,
  Logger,
  AgentRequest,
  AgentContext,
} from '../../types';

export interface OrchestratorConfig {
  agents: Map<string, IAgent>;
  defaultAgent: string;
  fallbackAgent?: string;
}

export interface OrchestratorRequest {
  userId: string;
  sessionId: string;
  query: string;
  context?: OrchestratorContext;
  options?: OrchestratorOptions;
}

export interface OrchestratorContext {
  currentBook?: BookReference;
  readingLocation?: BookLocation;
  conversationHistory?: ConversationMessage[];
  userPreferences?: UserPreferences;
  sharedMemories?: SharedMemory[];
}

export interface OrchestratorOptions {
  agent?: string; // Force specific agent
  parallel?: boolean; // Run agents in parallel
  maxAgents?: number; // Max agents to use
  timeout?: number; // Max execution time
}

export interface OrchestratorResponse {
  success: boolean;
  content: string;
  agentsUsed: AgentExecution[];
  synthesis?: string;
  metadata: ResponseMetadata;
  error?: AgentError;
}

export interface AgentExecution {
  agentName: string;
  duration: number;
  success: boolean;
  response?: AgentResponse;
  error?: AgentError;
}

export interface ResponseMetadata {
  totalDuration: number;
  totalTokens: number;
  totalCost: number;
  timestamp: Date;
  requestId: string;
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Multi-Agent Orchestrator
 *
 * Coordinates between multiple AI agents to provide comprehensive
 * assistance to users. Determines which agents to use based on
 * the query and executes them in the optimal order.
 */
export class AgentOrchestrator {
  private agents: Map<string, IAgent>;
  private config: OrchestratorConfig;
  private logger: Logger;

  constructor(config: OrchestratorConfig, logger: Logger) {
    this.agents = config.agents;
    this.config = config;
    this.logger = logger;

    // Validate configuration
    this.validateConfig();
  }

  /**
   * Process a user request through the appropriate agents
   */
  async process(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    this.logger.info('Processing orchestrator request', {
      requestId,
      userId: request.userId,
      query: request.query,
      options: request.options
    });

    try {
      // 1. Analyze the request to determine which agents to use
      const agentPlan = this.planAgentExecution(request);

      this.logger.debug('Agent execution plan', {
        requestId,
        agents: agentPlan.agents.map(a => a.name),
        parallel: agentPlan.parallel,
        order: agentPlan.order
      });

      // 2. Execute agents
      const executions = await this.executeAgents(
        agentPlan,
        request,
        requestId
      );

      // 3. Synthesize results
      const response = await this.synthesizeResults(
        executions,
        request,
        startTime,
        requestId
      );

      this.logger.info('Orchestrator request completed', {
        requestId,
        duration: response.metadata.totalDuration,
        agentsUsed: response.agentsUsed.length,
        success: response.success
      });

      return response;

    } catch (error) {
      this.logger.error('Orchestrator request failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        content: 'I encountered an error processing your request.',
        agentsUsed: [],
        metadata: {
          totalDuration: Date.now() - startTime,
          totalTokens: 0,
          totalCost: 0,
          timestamp: new Date(),
          requestId
        },
        error: {
          code: 'ORCHESTRATOR_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true
        }
      };
    }
  }

  /**
   * Plan which agents to use and in what order
   */
  private planAgentExecution(
    request: OrchestratorRequest
  ): AgentExecutionPlan {
    // If specific agent requested, use only that agent
    if (request.options?.agent) {
      const agent = this.agents.get(request.options.agent);
      if (!agent) {
        throw new Error(`Agent not found: ${request.options.agent}`);
      }

      return {
        agents: [agent],
        parallel: false,
        order: [[agent.name]]
      };
    }

    // Analyze the query to determine required agents
    const requiredAgents = this.analyzeQuery(request.query, request.context);

    // Limit number of agents if specified
    const selectedAgents = request.options?.maxAgents
      ? requiredAgents.slice(0, request.options.maxAgents)
      : requiredAgents;

    // Determine execution order
    const order = this.determineExecutionOrder(selectedAgents, request);

    return {
      agents: selectedAgents,
      parallel: request.options?.parallel ?? false,
      order
    };
  }

  /**
   * Analyze query to determine which agents are needed
   */
  private analyzeQuery(
    query: string,
    context?: OrchestratorContext
  ): IAgent[] {
    const agents: IAgent[] = [];
    const queryLower = query.toLowerCase();

    // Companion Agent - always include for basic assistance
    const companionAgent = this.agents.get('companion');
    if (companionAgent) {
      agents.push(companionAgent);
    }

    // Research Agent - for search, verification, citations
    const researchKeywords = [
      'search', 'find', 'look for', 'what else', 'have i read',
      'verify', 'check if', 'true', 'accurate', 'source'
    ];
    if (researchKeywords.some(kw => queryLower.includes(kw))) {
      const researchAgent = this.agents.get('research');
      if (researchAgent) agents.push(researchAgent);
    }

    // Coach Agent - for strategies, comprehension, progress
    const coachKeywords = [
      'how to read', 'strategy', 'understand', 'comprehend',
      'confused', 'lost', 'progress', 'goal', 'improve'
    ];
    if (coachKeywords.some(kw => queryLower.includes(kw))) {
      const coachAgent = this.agents.get('coach');
      if (coachAgent) agents.push(coachAgent);
    }

    // Synthesis Agent - for multi-document analysis
    const synthesisKeywords = [
      'compare', 'contrast', 'synthesize', 'combine', 'across',
      'multiple', 'together', 'between', 'similarities', 'differences'
    ];
    if (synthesisKeywords.some(kw => queryLower.includes(kw))) {
      const synthesisAgent = this.agents.get('synthesis');
      if (synthesisAgent) agents.push(synthesisAgent);
    }

    // Fallback to default agent if no agents selected
    if (agents.length === 0) {
      const defaultAgent = this.agents.get(this.config.defaultAgent);
      if (defaultAgent) agents.push(defaultAgent);
    }

    return agents;
  }

  /**
   * Determine the execution order for agents
   */
  private determineExecutionOrder(
    agents: IAgent[],
    request: OrchestratorRequest
  ): string[][] {
    const order: string[][] = [];

    // Agent dependencies (which agents must run before others)
    const dependencies: Record<string, string[]> = {
      'synthesis': ['research', 'companion'], // Synthesis needs research data
      'coach': ['companion'], // Coach benefits from companion analysis
    };

    // Group agents by dependency level
    const levels: string[][] = [];
    const used = new Set<string>();

    // First level: agents with no unmet dependencies
    const level1 = agents.filter(a => {
      const deps = dependencies[a.name] || [];
      return deps.every(d => !agents.some(agent => agent.name === d));
    });
    level1.forEach(a => used.add(a.name));
    levels.push(level1.map(a => a.name));

    // Second level: agents whose dependencies are in level1
    const level2 = agents.filter(a => {
      if (used.has(a.name)) return false;
      const deps = dependencies[a.name] || [];
      return deps.every(d => used.has(d));
    });
    level2.forEach(a => used.add(a.name));
    if (level2.length > 0) {
      levels.push(level2.map(a => a.name));
    }

    // Remaining agents (if any)
    const remaining = agents.filter(a => !used.has(a.name));
    if (remaining.length > 0) {
      levels.push(remaining.map(a => a.name));
    }

    return levels;
  }

  /**
   * Execute agents according to the plan
   */
  private async executeAgents(
    plan: AgentExecutionPlan,
    request: OrchestratorRequest,
    requestId: string
  ): Promise<AgentExecution[]> {
    const executions: AgentExecution[] = [];
    const timeout = request.options?.timeout ?? 30000;

    // Build agent context
    const agentContext: AgentContext = {
      readingLocation: request.context?.readingLocation,
      currentBook: request.context?.currentBook,
      userUnderstandingLevel: undefined,
      conversationHistory: request.context?.conversationHistory,
      userPreferences: request.context?.userPreferences,
      sharedMemories: request.context?.sharedMemories
    };

    // Execute agents in order (level by level)
    for (const level of plan.order) {
      if (plan.parallel && level.length > 1) {
        // Execute agents in this level in parallel
        const levelExecutions = await Promise.all(
          level.map(agentName =>
            this.executeAgentWithTimeout(
              agentName,
              request,
              agentContext,
              timeout,
              requestId
            )
          )
        );
        executions.push(...levelExecutions);
      } else {
        // Execute agents in this level sequentially
        for (const agentName of level) {
          const execution = await this.executeAgentWithTimeout(
            agentName,
            request,
            agentContext,
            timeout,
            requestId
          );
          executions.push(execution);
        }
      }
    }

    return executions;
  }

  /**
   * Execute a single agent with timeout
   */
  private async executeAgentWithTimeout(
    agentName: string,
    request: OrchestratorRequest,
    context: AgentContext,
    timeout: number,
    requestId: string
  ): Promise<AgentExecution> {
    const startTime = Date.now();
    const agent = this.agents.get(agentName);

    if (!agent) {
      return {
        agentName,
        duration: Date.now() - startTime,
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: `Agent not found: ${agentName}`,
          recoverable: false
        }
      };
    }

    this.logger.debug('Executing agent', {
      requestId,
      agent: agentName,
      query: request.query
    });

    try {
      // Create agent request
      const agentRequest: AgentRequest = {
        userId: request.userId,
        sessionId: request.sessionId,
        action: 'chat',
        input: { query: request.query },
        context
      };

      // Execute with timeout
      const response = await this.withTimeout(
        agent.execute(agentRequest),
        timeout
      );

      return {
        agentName,
        duration: Date.now() - startTime,
        success: true,
        response
      };

    } catch (error) {
      this.logger.error('Agent execution failed', {
        requestId,
        agent: agentName,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        agentName,
        duration: Date.now() - startTime,
        success: false,
        error: {
          code: 'AGENT_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true
        }
      };
    }
  }

  /**
   * Synthesize results from multiple agents
   */
  private async synthesizeResults(
    executions: AgentExecution[],
    request: OrchestratorRequest,
    startTime: number,
    requestId: string
  ): Promise<OrchestratorResponse> {
    const successfulExecutions = executions.filter(e => e.success);
    const failedExecutions = executions.filter(e => !e.success);

    // Calculate totals
    let totalTokens = 0;
    let totalCost = 0;

    successfulExecutions.forEach(exec => {
      if (exec.response?.metadata) {
        totalTokens += exec.response.metadata.tokensUsed || 0;
        totalCost += exec.response.metadata.cost || 0;
      }
    });

    // If all agents failed, return error
    if (successfulExecutions.length === 0) {
      return {
        success: false,
        content: 'I apologize, but I encountered an error processing your request.',
        agentsUsed: executions,
        metadata: {
          totalDuration: Date.now() - startTime,
          totalTokens: 0,
          totalCost: 0,
          timestamp: new Date(),
          requestId
        },
        error: {
          code: 'ALL_AGENTS_FAILED',
          message: 'All agents failed to execute',
          recoverable: true
        }
      };
    }

    // If only one agent succeeded, return its response
    if (successfulExecutions.length === 1) {
      const exec = successfulExecutions[0];
      return {
        success: true,
        content: exec.response?.content || '',
        agentsUsed: executions,
        metadata: {
          totalDuration: Date.now() - startTime,
          totalTokens,
          totalCost,
          timestamp: new Date(),
          requestId
        }
      };
    }

    // Multiple agents succeeded - synthesize their responses
    const synthesis = await this.synthesizeMultipleResponses(
      successfulExecutions,
      request
    );

    return {
      success: true,
      content: synthesis.content,
      agentsUsed: executions,
      synthesis: synthesis.reasoning,
      metadata: {
        totalDuration: Date.now() - startTime,
        totalTokens,
        totalCost,
        timestamp: new Date(),
        requestId
      }
    };
  }

  /**
   * Synthesize responses from multiple agents
   */
  private async synthesizeMultipleResponses(
    executions: AgentExecution[],
    request: OrchestratorRequest
  ): Promise<{ content: string; reasoning: string }> {
    // Group responses by agent type
    const companionResponse = executions.find(e => e.agentName === 'companion');
    const researchResponse = executions.find(e => e.agentName === 'research');
    const coachResponse = executions.find(e => e.agentName === 'coach');
    const synthesisResponse = executions.find(e => e.agentName === 'synthesis');

    // Build synthesized response
    const parts: string[] = [];

    // Start with companion's explanation
    if (companionResponse?.response?.content) {
      parts.push(companionResponse.response.content);
    }

    // Add research findings
    if (researchResponse?.response?.content) {
      parts.push(`\n\n**Additional Information:**\n${researchResponse.response.content}`);
    }

    // Add coaching insights
    if (coachResponse?.response?.content) {
      parts.push(`\n\n**Reading Tip:**\n${coachResponse.response.content}`);
    }

    // Use synthesis agent's compilation if available
    if (synthesisResponse?.response?.content) {
      return {
        content: synthesisResponse.response.content,
        reasoning: `Synthesized input from ${executions.length} agents`
      };
    }

    // Otherwise, build combined response
    return {
      content: parts.join('\n\n').trim(),
      reasoning: `Combined insights from ${executions.length} agents: ${executions.map(e => e.agentName).join(', ')}`
    };
  }

  /**
   * Execute a promise with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
  }

  /**
   * Validate orchestrator configuration
   */
  private validateConfig(): void {
    if (!this.config.defaultAgent) {
      throw new Error('Orchestrator requires a default agent');
    }

    if (!this.agents.has(this.config.defaultAgent)) {
      throw new Error(`Default agent not found: ${this.config.defaultAgent}`);
    }

    if (this.agents.size === 0) {
      throw new Error('Orchestrator requires at least one agent');
    }
  }

  /**
   * Add an agent to the orchestrator
   */
  addAgent(agent: IAgent): void {
    this.agents.set(agent.name, agent);
    this.logger.info('Agent added to orchestrator', { agent: agent.name });
  }

  /**
   * Remove an agent from the orchestrator
   */
  removeAgent(agentName: string): void {
    this.agents.delete(agentName);
    this.logger.info('Agent removed from orchestrator', { agent: agentName });
  }

  /**
   * Get all registered agents
   */
  getAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get a specific agent
   */
  getAgent(name: string): IAgent | undefined {
    return this.agents.get(name);
  }
}

// ============================================================================
// Helper Types
// ============================================================================

interface AgentExecutionPlan {
  agents: IAgent[];
  parallel: boolean;
  order: string[][]; // Execution order (levels of agents that can run in parallel)
}
