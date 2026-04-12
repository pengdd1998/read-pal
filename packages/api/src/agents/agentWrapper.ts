/**
 * Agent Wrapper Factory
 *
 * Creates IAgent wrappers that route method calls to the appropriate
 * method on each agent instance (chat, execute, etc.) and normalize
 * response shapes.
 */

import { IAgent, AgentRequest, AgentResponse } from '../types';

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'glm-4.7-flash';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAgentWrapper(name: string, displayName: string, agentInstance: any): IAgent {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result: any;

        switch (name) {
          case 'companion':
          case 'coach':
            result = await agentInstance.chat(request.userId, query, request.context);
            break;
          case 'research': {
            const action = (request.action === 'chat' ? 'deep_dive' : request.action || 'deep_dive') as string;
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

        const content = result?.response || result?.content || result?.message || '';

        return {
          content,
          success: true,
          metadata: {
            agentName: name,
            tokensUsed: result?.metadata?.tokensUsed || result?.tokensUsed || 0,
            cost: result?.metadata?.cost || result?.cost || 0,
            duration: Date.now() - startTime,
            modelUsed: result?.metadata?.modelUsed || result?.modelUsed || DEFAULT_MODEL,
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
