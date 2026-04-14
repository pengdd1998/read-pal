/**
 * Agent Wrapper Factory
 *
 * Creates IAgent wrappers that route method calls to the appropriate
 * method on each agent instance (chat, execute, etc.) and normalize
 * response shapes.
 */

import { IAgent, AgentRequest, AgentResponse } from '../types';

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'glm-4.7-flash';

interface AgentResult {
  response?: string;
  content?: string;
  message?: string;
  tokensUsed?: number;
  cost?: number;
  modelUsed?: string;
  metadata?: {
    tokensUsed?: number;
    cost?: number;
    modelUsed?: string;
  };
}

/** Minimal interface that all agent instances satisfy */
interface AgentInstance {
  chat?(userId: string, query: string, context?: unknown): Promise<AgentResult>;
  execute?(...args: unknown[]): Promise<AgentResult>;
}

// Agent instances have heterogeneous interfaces (chat vs execute with different args).
export function createAgentWrapper(name: string, displayName: string, agentInstance: AgentInstance): IAgent {
  return {
    name,
    displayName,
    version: '1.0.0',
    purpose: displayName,
    responsibilities: [],
    model: DEFAULT_MODEL,
    systemPrompt: '',
    tools: [],
    memoryType: 'session',
    interventionStyle: 'reactive',
    execute: async (request: AgentRequest): Promise<AgentResponse> => {
      const startTime = Date.now();
      try {
        const input = (request.input as Record<string, unknown>) || {};
        const query = (input.query || input.message || '') as string;
        let result: AgentResult = {};

        switch (name) {
          case 'companion':
          case 'coach':
            result = (await agentInstance.chat!(request.userId, query, request.context)) ?? result;
            break;
          case 'research': {
            const action = (request.action === 'chat' ? 'deep_dive' : request.action || 'deep_dive') as string;
            result = (await agentInstance.execute!(request.userId, query, action, request.context)) ?? result;
            break;
          }
          case 'synthesis':
            result = (await agentInstance.execute!(request)) ?? result;
            break;
          case 'friend':
            result = (await agentInstance.chat!(request.userId, query, request.context)) ?? result;
            break;
          default:
            if (agentInstance.execute) {
              result = (await agentInstance.execute(request)) ?? result;
            } else if (agentInstance.chat) {
              result = (await agentInstance.chat(request.userId, query, request.context)) ?? result;
            } else {
              throw new Error(`Agent ${name} has no compatible method`);
            }
        }

        const content = result.response || result.content || result.message || '';

        return {
          content,
          success: true,
          metadata: {
            agentName: name,
            tokensUsed: result.metadata?.tokensUsed || result.tokensUsed || 0,
            cost: result.metadata?.cost || result.cost || 0,
            duration: Date.now() - startTime,
            modelUsed: result.metadata?.modelUsed || result.modelUsed || DEFAULT_MODEL,
          },
        };
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Agent ${name} execution failed:`, errMsg);
        return {
          content: 'I encountered an error processing your request. Please try again.',
          success: false,
          metadata: {
            agentName: name,
            tokensUsed: 0,
            cost: 0,
            duration: Date.now() - startTime,
            modelUsed: DEFAULT_MODEL,
          },
        };
      }
    },
  };
}
