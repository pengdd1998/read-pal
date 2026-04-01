/**
 * Companion Agent - Real-time Reading Assistance
 *
 * The Companion Agent helps readers understand text in context by:
 * - Explaining difficult concepts
 * - Answering questions about the text
 * - Providing context and background information
 * - Suggesting related content from the user's library
 */

import { chatCompletion, DEFAULT_MODEL } from '../../services/llmClient';
import type { ToolContext } from '../../types';
import { BaseTool } from '../tools/BaseTool';
import { LibrarySearchTool } from '../tools/LibrarySearchTool';
import { WebSearchTool } from '../tools/WebSearchTool';

interface CompanionAgentConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface CompanionMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CompanionContext {
  bookId?: string;
  currentPage?: number;
  selectedText?: string;
  userReadingLevel?: 'beginner' | 'intermediate' | 'advanced';
}

export class CompanionAgent {
  private config: Required<CompanionAgentConfig>;
  private tools: Map<string, BaseTool>;
  private conversationHistory: Map<string, CompanionMessage[]>;

  constructor(config: CompanionAgentConfig = {}) {
    this.config = {
      model: config.model || DEFAULT_MODEL,
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.7,
    };

    this.tools = new Map();
    this.conversationHistory = new Map();

    // Register available tools
    this.registerTool(new LibrarySearchTool());
    this.registerTool(new WebSearchTool());
  }

  /**
   * Register a tool for the agent to use
   */
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get the system prompt for the Companion Agent
   */
  private getSystemPrompt(): string {
    return `You are a Companion Agent for read-pal, an AI reading companion application.

## Your Purpose
You help readers understand text in context by explaining difficult concepts, answering questions, and providing relevant background information.

## Your Responsibilities
- Explain concepts clearly and concisely
- Adapt explanations to the user's reading level
- Use examples and analogies when helpful
- Search the user's library for related content
- Search the web when necessary for current information
- Encourage curiosity and deeper understanding

## Your Personality
- Friendly but professional
- Patient and supportive
- Never condescending
- Concise - respect that the user wants to keep reading
- Admit when you don't know something

## Available Tools
You have access to the following tools:
${this.getToolDescriptions()}

## Constraints
- Keep responses under 200 words unless user asks for more detail
- Don't interrupt reading flow unless necessary
- Use tools only when they add clear value
- Never make up information

Remember: You are an AI assistant helping someone read and learn. Be helpful, concise, and respectful of their reading experience.`;
  }

  /**
   * Get descriptions of available tools
   */
  private getToolDescriptions(): string {
    const descriptions: string[] = [];

    for (const tool of this.tools.values()) {
      descriptions.push(`- ${tool.name}: ${tool.description}`);
    }

    return descriptions.join('\n');
  }

  /**
   * Chat with the user
   */
  async chat(
    userId: string,
    message: string,
    context?: CompanionContext
  ): Promise<{ response: string; toolsUsed?: string[] }> {
    try {
      // Get or create conversation history
      let history = this.conversationHistory.get(userId);
      if (!history) {
        history = [];
        this.conversationHistory.set(userId, history);
      }

      // Build messages array
      const messages: CompanionMessage[] = [
        ...history,
        {
          role: 'user',
          content: this.buildUserMessage(message, context),
        },
      ];

      // Check if tools might be needed
      const toolsUsed: string[] = [];
      let toolResults: string | null = null;

      // Simple heuristic: use tools if user asks about related content or current info
      const mightNeedTools =
        message.toLowerCase().includes('related') ||
        message.toLowerCase().includes('else') ||
        message.toLowerCase().includes('similar') ||
        message.toLowerCase().includes('what else');

      if (mightNeedTools && context?.bookId) {
        // Try library search first
        const libraryTool = this.tools.get('library_search');
        if (libraryTool) {
          try {
            const result = await libraryTool.execute({
              query: message,
              userId,
              filters: { excludeBookId: context.bookId },
            }, {} as ToolContext);

            if (result.success) {
              toolsUsed.push('library_search');
              const data = result.data as Record<string, unknown> | undefined;
              toolResults = `\n\n[Related content from your library]\n${(data?.summary as string) || ''}`;
            }
          } catch (error) {
            console.error('Library search failed:', error);
          }
        }
      }

      // Call GLM via shared client
      const responseText = await chatCompletion({
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: this.getSystemPrompt(),
        messages,
      });

      // Append tool results if available
      const finalResponse = toolResults
        ? `${responseText}${toolResults}`
        : responseText;

      // Update conversation history
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: finalResponse });

      // Keep history manageable (last 10 messages)
      if (history.length > 10) {
        history.splice(0, history.length - 10);
      }

      return {
        response: finalResponse,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
      };
    } catch (error) {
      console.error('Companion Agent error:', error);

      // Fallback response
      return {
        response: `I apologize, but I encountered an issue. Please try again or rephrase your question.`,
      };
    }
  }

  /**
   * Build the user message with context
   */
  private buildUserMessage(message: string, context?: CompanionContext): string {
    let messageWithContext = message;

    if (context) {
      const contextParts: string[] = [];

      if (context.selectedText) {
        contextParts.push(`Selected text: "${context.selectedText}"`);
      }

      if (context.currentPage !== undefined) {
        contextParts.push(`Current page: ${context.currentPage + 1}`);
      }

      if (context.userReadingLevel) {
        contextParts.push(`Reading level: ${context.userReadingLevel}`);
      }

      if (contextParts.length > 0) {
        messageWithContext = `[Context: ${contextParts.join(', ')}]\n\n${message}`;
      }
    }

    return messageWithContext;
  }

  /**
   * Clear conversation history for a user
   */
  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
  }

  /**
   * Get conversation history for a user
   */
  getHistory(userId: string): CompanionMessage[] {
    return this.conversationHistory.get(userId) || [];
  }
}
