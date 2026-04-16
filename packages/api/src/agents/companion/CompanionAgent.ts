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
import { detectGenre, getGenreInstructions, type BookGenre } from '../../services/genrePrompts';
import type { ToolContext } from '../../types';
import { BaseTool } from '../tools/BaseTool';
import { LibrarySearchTool } from '../tools/LibrarySearchTool';
import { WebSearchTool } from '../tools/WebSearchTool';
import { sanitizePromptInput } from '../../utils/promptSanitizer';

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
  bookTitle?: string;
  author?: string;
  currentPage?: number;
  totalPages?: number;
  selectedText?: string;
  chapterTitle?: string;
  userReadingLevel?: 'beginner' | 'intermediate' | 'advanced';
  recentHighlights?: string[];
  readingProgress?: number;
  genres?: string[];
  bookDescription?: string;
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
  private getSystemPrompt(context?: CompanionContext): string {
    const progressContext = context?.readingProgress !== undefined
      ? `\n\n## Reading Progress\nThe reader is ${Math.round(context.readingProgress)}% through the book${context.totalPages ? ` (${context.currentPage !== undefined ? context.currentPage + 1 : '?'}/${context.totalPages} pages)` : ''}. ${context.readingProgress < 25 ? 'They are just getting started — be especially encouraging.' : context.readingProgress > 75 ? 'They are deep into the book — reference earlier themes when relevant.' : ''}`
      : '';

    const highlightsContext = context?.recentHighlights && context.recentHighlights.length > 0
      ? `\n\n## What They've Highlighted\nThe reader found these passages noteworthy:\n${context.recentHighlights.slice(0, 5).map((h) => `- "${h.slice(0, 120)}"`).join('\n')}\nUse these to understand what resonates with them.`
      : '';

    // Genre-aware prompt additions
    const genre: BookGenre = detectGenre(context?.genres, context?.bookTitle, context?.bookDescription);
    const genreBlock = getGenreInstructions(genre);

    return `You are a reading companion for read-pal, an AI-powered reading app.

## Your Purpose
Help readers understand, engage with, and enjoy what they're reading. You are a knowledgeable friend who happens to be reading alongside them.

## How to Respond
1. **Explain clearly** — Use simple analogies. Break complex ideas into steps.
2. **Ask back** — After answering, ask a follow-up question. "Does that make sense?" or "What do you think the author means by that?"
3. **Connect** — Reference earlier parts of the book when relevant.
4. **Be concise** — Under 200 words unless they ask for more. They want to keep reading.
5. **Admit uncertainty** — "I'm not sure about that" is better than guessing.

## When They Select Text
If they've selected specific text, focus your answer on that passage. Explain what it means, why it matters, or what the author is doing stylistically.

## When They Ask Questions
- Conceptual: Explain in plain language, then give an analogy
- Factual: Answer directly, suggest where to learn more
- Opinion: Share a perspective, ask for theirs

## Your Personality
- Warm, curious, never condescending
- Excited about ideas but respectful of reading time
- You love books but you're not pretentious about it

## Tools
${this.getToolDescriptions()}
${progressContext}${highlightsContext}
${genreBlock}

Remember: Your job is to make reading more enjoyable and meaningful. Be a great reading partner.`;
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
        system: this.getSystemPrompt(context),
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
        contextParts.push(`Selected text: "${sanitizePromptInput(context.selectedText, 'Selected Text')}"`);
      }

      if (context.currentPage !== undefined) {
        contextParts.push(`Current page: ${context.currentPage + 1}`);
      }

      if (context.bookTitle) {
        contextParts.push(`Book: "${context.bookTitle}" by ${context.author || 'unknown'}`);
      }

      if (context.chapterTitle) {
        contextParts.push(`Chapter: ${context.chapterTitle}`);
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
