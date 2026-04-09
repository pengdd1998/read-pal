/**
 * GLM-powered agent loop.
 *
 * Implements a ReAct-style agent that:
 *  1. Sends the task prompt + conversation history to GLM
 *  2. If GLM responds with tool calls → execute them → append results → loop
 *  3. If GLM responds with text only → task is done
 *
 * Budget and turn limits prevent runaway costs.
 */

import OpenAI from 'openai';
import { toolDefinitions, executeTool, type ToolResult } from './tools.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GLM_API_KEY = process.env.GLM_API_KEY || '';
const GLM_BASE_URL = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/';
const GLM_MODEL = process.env.GLM_MODEL || 'glm-4-flash';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const client = new OpenAI({
  apiKey: GLM_API_KEY,
  baseURL: GLM_BASE_URL,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentResult {
  success: boolean;
  output: string;
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolsUsed: string[];
  error?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

export async function runAgentLoop(opts: {
  prompt: string;
  maxTurns: number;
  maxBudgetUsd: number;
  systemSuffix?: string;
}): Promise<AgentResult> {
  const systemPrompt = `You are an autonomous development agent for the read-pal project.

## Your capabilities
You can use tools to read, write, and edit files, run shell commands, search code, and find files.

## Rules
1. Always work in the project directory (${process.env.PROJECT_ROOT || '/Volumes/ExternalDisk/read-pal'})
2. Use tools to accomplish tasks — never guess file contents
3. When running git commands, use standard commit messages
4. Be concise — avoid unnecessary explanations, just do the work
5. If a task fails, diagnose the root cause before retrying
6. Report your findings clearly at the end

${opts.systemSuffix || ''}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'user', content: opts.prompt },
  ];

  let turns = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolsUsed: string[] = [];

  while (turns < opts.maxTurns) {
    turns++;

    let response: OpenAI.Chat.ChatCompletion | undefined;
    let lastError: Error | undefined;

    // Retry GLM API calls on transient failures
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        response = await client.chat.completions.create({
          model: GLM_MODEL,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          tools: toolDefinitions as OpenAI.Chat.ChatCompletionTool[],
          max_tokens: 4096,
          temperature: 0.7,
        });
        lastError = undefined;
        break;
      } catch (err: unknown) {
        lastError = err as Error;
        const status = (err as { status?: number }).status;
        // Only retry on 429/5xx
        if (status && (status === 429 || (status >= 500 && status < 600))) {
          console.log(`[agent] GLM API error ${status}, retry ${attempt + 1}/${MAX_RETRIES}...`);
          await sleep(RETRY_DELAYS[attempt] ?? 4000);
          continue;
        }
        // Non-retryable error — break immediately
        break;
      }
    }

    if (!response || lastError) {
      return {
        success: false,
        output: '',
        turns,
        totalInputTokens,
        totalOutputTokens,
        toolsUsed,
        error: `GLM API error: ${lastError?.message || 'unknown'}`,
      };
    }

    const choice = response.choices[0];
    if (!choice) {
      return {
        success: false,
        output: '',
        turns,
        totalInputTokens,
        totalOutputTokens,
        toolsUsed,
        error: 'No response from GLM',
      };
    }

    // Track token usage
    if (response.usage) {
      totalInputTokens += response.usage.prompt_tokens || 0;
      totalOutputTokens += response.usage.completion_tokens || 0;
    }

    const message = choice.message;

    // If there's text content, log it
    if (message.content) {
      console.log(`[agent] ${message.content.slice(0, 500)}${message.content.length > 500 ? '...' : ''}`);
    }

    // If no tool calls → agent is done
    if (!message.tool_calls || message.tool_calls.length === 0) {
      // Push assistant message for history consistency
      messages.push({ role: 'assistant', content: message.content || '' });
      return {
        success: (choice.finish_reason as string) !== 'error',
        output: message.content || '',
        turns,
        totalInputTokens,
        totalOutputTokens,
        toolsUsed,
      };
    }

    // Process tool calls
    messages.push(message as OpenAI.Chat.ChatCompletionAssistantMessageParam);

    for (const toolCall of message.tool_calls as ToolCall[]) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

      console.log(`[agent] Tool: ${toolName}(${JSON.stringify(toolArgs).slice(0, 200)})`);

      const result: ToolResult = executeTool(toolName, toolArgs);

      if (!toolsUsed.includes(toolName)) {
        toolsUsed.push(toolName);
      }

      console.log(
        `[agent] Result: ${result.success ? 'OK' : 'FAIL'} — ${result.output.slice(0, 300)}${result.output.length > 300 ? '...' : ''}`,
      );

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result.output.slice(0, 8000), // Cap tool output to stay within context
      } as OpenAI.Chat.ChatCompletionToolMessageParam);
    }

    // Rough budget check: GLM-4-flash is ~$0.0001/1K tokens
    const estimatedCost = (totalInputTokens * 0.0000001 + totalOutputTokens * 0.0000001);
    if (estimatedCost > opts.maxBudgetUsd) {
      console.log(`[agent] Budget limit reached ($${estimatedCost.toFixed(4)} > $${opts.maxBudgetUsd})`);
      break;
    }
  }

  // If we hit max turns, ask for a final summary
  if (turns >= opts.maxTurns) {
    messages.push({
      role: 'user',
      content: 'You have reached your turn limit. Provide a brief summary of what you accomplished and what remains.',
    });

    try {
      const finalResponse = await client.chat.completions.create({
        model: GLM_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 1024,
        temperature: 0.3,
      });

      const summary = finalResponse.choices[0]?.message?.content || '';
      return {
        success: true,
        output: summary,
        turns,
        totalInputTokens,
        totalOutputTokens,
        toolsUsed,
      };
    } catch {
      return {
        success: true,
        output: 'Task completed (max turns reached, summary unavailable).',
        turns,
        totalInputTokens,
        totalOutputTokens,
        toolsUsed,
      };
    }
  }

  return {
    success: true,
    output: 'Task loop ended.',
    turns,
    totalInputTokens,
    totalOutputTokens,
    toolsUsed,
  };
}
