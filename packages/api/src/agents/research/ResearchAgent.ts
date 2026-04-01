/**
 * Research Agent - Deep-dive Research & Cross-referencing
 *
 * The Research Agent provides in-depth analysis and research capabilities:
 * - Deep-dive analysis on topics readers want to explore
 * - Cross-referencing across the user's library
 * - Background context (historical, scientific, cultural)
 * - Fact checking and verification of claims in the text
 */

import { chatCompletion, DEFAULT_MODEL } from '../../services/llmClient';
import type { ToolContext } from '../../types';
import { BaseTool } from '../tools/BaseTool';
import { LibrarySearchTool } from '../tools/LibrarySearchTool';
import { WebSearchTool } from '../tools/WebSearchTool';

// ============================================================================
// Configuration
// ============================================================================

interface ResearchAgentConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface ResearchMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ResearchContext {
  bookId?: string;
  bookTitle?: string;
  bookAuthor?: string;
  currentPage?: number;
  selectedText?: string;
  chapterTitle?: string;
  userReadingLevel?: 'beginner' | 'intermediate' | 'advanced';
  researchDepth?: 'quick' | 'standard' | 'deep';
}

interface ResearchToolResult {
  toolName: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================================
// Research Action Types
// ============================================================================

type ResearchAction =
  | 'deep_dive'
  | 'cross_reference'
  | 'background_context'
  | 'fact_check'
  | 'explore_topic';

interface ResearchedTopic {
  topic: string;
  summary: string;
  sources: string[];
  relatedContent: string[];
  confidence: number;
}

// ============================================================================
// Research Agent Class
// ============================================================================

export class ResearchAgent {
  private config: Required<ResearchAgentConfig>;
  private tools: Map<string, BaseTool>;
  private conversationHistory: Map<string, ResearchMessage[]>;

  constructor(config: ResearchAgentConfig = {}) {
    this.config = {
      model: config.model || DEFAULT_MODEL,
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.5,
    };

    this.tools = new Map();
    this.conversationHistory = new Map();

    // Register research tools
    this.registerTool(new LibrarySearchTool());
    this.registerTool(new WebSearchTool());
  }

  // ==========================================================================
  // Tool Management
  // ==========================================================================

  /**
   * Register a tool for the agent to use
   */
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
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

  // ==========================================================================
  // System Prompt
  // ==========================================================================

  /**
   * Get the system prompt for the Research Agent
   */
  private getSystemPrompt(context?: ResearchContext): string {
    const depthInstruction = this.getDepthInstruction(context?.researchDepth);
    const levelInstruction = this.getLevelInstruction(context?.userReadingLevel);

    return `You are the Research Agent for read-pal, an AI reading companion application.

## Your Purpose
You provide deep-dive research, cross-referencing, and background context for readers. You help readers explore topics thoroughly, verify claims, and understand the broader context of what they are reading.

## Your Responsibilities
- Conduct deep-dive analysis on topics the reader wants to explore
- Cross-reference content across the user's reading library
- Provide historical, scientific, or cultural background context
- Fact-check claims and verify information
- Present research findings in a clear, organized manner
- Connect current reading to broader themes and knowledge areas

## Your Personality
- Thorough and methodical in research
- Objective and balanced in presenting findings
- Curious and intellectually engaged
- Clear in distinguishing between facts, interpretations, and open questions
- Patient in explaining complex research findings
- Transparent about the limits of available information

## Research Approach
${depthInstruction}

## Audience Level
${levelInstruction}

## Available Tools
You have access to the following tools:
${this.getToolDescriptions()}

## How to Present Research
1. Start with a concise summary of findings
2. Provide supporting evidence and sources
3. Note any caveats or limitations
4. Connect findings to the reader's current text when relevant
5. Suggest related topics for further exploration when appropriate

## Constraints
- Distinguish clearly between verified facts and claims that need further verification
- Always cite sources when presenting research findings
- Acknowledge when evidence is mixed or inconclusive
- Keep responses focused and relevant to the reader's question
- Do not fabricate sources or research findings
- Respect the reader's time - match detail level to their research depth preference

Remember: You are a research specialist helping someone learn deeply about what they are reading. Be thorough, accurate, and intellectually honest.`;
  }

  /**
   * Get depth-specific instructions
   */
  private getDepthInstruction(depth?: string): string {
    switch (depth) {
      case 'quick':
        return 'The reader wants a quick overview. Provide concise, high-level findings. Focus on the most relevant and established information. Limit to key points.';
      case 'deep':
        return 'The reader wants an exhaustive deep-dive. Be thorough and comprehensive. Explore multiple angles, present nuanced findings, and provide detailed source material. Cover edge cases and competing viewpoints.';
      default:
        return 'The reader wants a standard research exploration. Provide a balanced treatment with enough detail to be useful while remaining focused. Cover main viewpoints and provide key sources.';
    }
  }

  /**
   * Get reading-level-specific instructions
   */
  private getLevelInstruction(level?: string): string {
    switch (level) {
      case 'beginner':
        return 'The reader is new to this subject. Avoid jargon, explain technical terms, and use analogies to connect to familiar concepts.';
      case 'advanced':
        return 'The reader has advanced knowledge. Use technical terminology freely, focus on nuances and recent developments, and assume familiarity with foundational concepts.';
      case 'expert':
        return 'The reader is an expert. Engage at the frontier of current knowledge, reference specific research and researchers, and focus on open questions and methodological nuances.';
      default:
        return 'The reader has intermediate knowledge. Balance accessibility with depth. Explain key technical terms on first use and build from foundational to more advanced concepts.';
    }
  }

  // ==========================================================================
  // Core Research Methods
  // ==========================================================================

  /**
   * Execute a research request
   *
   * This is the main entry point for the Research Agent. It analyzes the
   * request, gathers information from tools, and produces a comprehensive
   * research response.
   */
  async execute(
    userId: string,
    message: string,
    action: ResearchAction = 'deep_dive',
    context?: ResearchContext
  ): Promise<{
    response: string;
    toolsUsed: string[];
    researchTopics?: ResearchedTopic[];
  }> {
    const startTime = Date.now();
    const toolsUsed: string[] = [];
    const researchTopics: ResearchedTopic[] = [];

    try {
      // Get or create conversation history
      let history = this.conversationHistory.get(userId);
      if (!history) {
        history = [];
        this.conversationHistory.set(userId, history);
      }

      // Phase 1: Gather information from tools
      const toolResults = await this.gatherInformation(
        userId,
        message,
        action,
        context
      );

      // Track which tools were used
      for (const result of toolResults) {
        if (result.success) {
          toolsUsed.push(result.toolName);
        }
      }

      // Phase 2: Build the enriched message with tool data
      const enrichedMessage = this.buildEnrichedMessage(
        message,
        action,
        context,
        toolResults
      );

      // Phase 3: Generate the research response via GLM
      const messages: { role: 'user' | 'assistant'; content: string }[] = [
        ...history.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: enrichedMessage,
        },
      ];

      const responseText = await chatCompletion({
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: this.getSystemPrompt(context),
        messages,
      });

      // Update conversation history
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: responseText });

      // Keep history manageable (last 20 messages for research context)
      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }

      return {
        response: responseText,
        toolsUsed,
        researchTopics: researchTopics.length > 0 ? researchTopics : undefined,
      };
    } catch (error) {
      console.error('Research Agent error:', {
        action,
        userId,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        response: this.getErrorResponse(error, action),
        toolsUsed,
      };
    }
  }

  /**
   * Deep-dive into a specific topic
   */
  async deepDive(
    userId: string,
    topic: string,
    context?: ResearchContext
  ): Promise<{
    response: string;
    toolsUsed: string[];
  }> {
    const message = `I'd like a deep-dive analysis on: "${topic}". Please provide comprehensive background, key concepts, differing viewpoints, and relevant sources.`;
    return this.execute(userId, message, 'deep_dive', {
      ...context,
      researchDepth: context?.researchDepth || 'deep',
    });
  }

  /**
   * Cross-reference current reading with the user's library
   */
  async crossReference(
    userId: string,
    text: string,
    context?: ResearchContext
  ): Promise<{
    response: string;
    toolsUsed: string[];
  }> {
    const message = `Please cross-reference the following with other content I've read: "${text}"`;
    return this.execute(userId, message, 'cross_reference', context);
  }

  /**
   * Get background context for the current reading
   */
  async getBackgroundContext(
    userId: string,
    text: string,
    context?: ResearchContext
  ): Promise<{
    response: string;
    toolsUsed: string[];
  }> {
    const message = `Please provide background context for: "${text}". Include historical, scientific, or cultural context as relevant.`;
    return this.execute(userId, message, 'background_context', context);
  }

  /**
   * Fact-check a claim from the text
   */
  async factCheck(
    userId: string,
    claim: string,
    context?: ResearchContext
  ): Promise<{
    response: string;
    toolsUsed: string[];
  }> {
    const message = `Please fact-check this claim: "${claim}". Verify the accuracy and provide evidence for or against it.`;
    return this.execute(userId, message, 'fact_check', {
      ...context,
      researchDepth: context?.researchDepth || 'standard',
    });
  }

  /**
   * Explore a topic related to the current reading
   */
  async exploreTopic(
    userId: string,
    topic: string,
    context?: ResearchContext
  ): Promise<{
    response: string;
    toolsUsed: string[];
  }> {
    const message = `I'm interested in exploring the topic of "${topic}" in relation to what I'm reading. What should I know?`;
    return this.execute(userId, message, 'explore_topic', context);
  }

  // ==========================================================================
  // Tool Orchestration
  // ==========================================================================

  /**
   * Gather information from available tools based on the research action
   */
  private async gatherInformation(
    userId: string,
    message: string,
    action: ResearchAction,
    context?: ResearchContext
  ): Promise<ResearchToolResult[]> {
    const results: ResearchToolResult[] = [];

    // Determine which tools to use based on action
    const shouldSearchLibrary = this.shouldSearchLibrary(action, message);
    const shouldSearchWeb = this.shouldSearchWeb(action, message);

    // Execute tool calls in parallel when both are needed
    const toolPromises: Promise<ResearchToolResult>[] = [];

    if (shouldSearchLibrary) {
      toolPromises.push(
        this.searchLibrary(userId, message, context)
          .then((result) => ({ toolName: 'library_search', ...result }))
          .catch((error) => ({
            toolName: 'library_search',
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }))
      );
    }

    if (shouldSearchWeb) {
      toolPromises.push(
        this.searchWeb(message, action)
          .then((result) => ({ toolName: 'web_search', ...result }))
          .catch((error) => ({
            toolName: 'web_search',
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }))
      );
    }

    const toolResults = await Promise.all(toolPromises);
    results.push(...toolResults);

    return results;
  }

  /**
   * Determine if library search is needed for this action
   */
  private shouldSearchLibrary(action: ResearchAction, message: string): boolean {
    if (action === 'cross_reference') return true;
    if (action === 'explore_topic') return true;

    // Heuristic: search library if message suggests looking at past reading
    const libraryKeywords = [
      'related', 'similar', 'else have i read', 'other books',
      'before', 'previously', 'also read', 'cross-reference',
    ];
    const lowerMessage = message.toLowerCase();
    return libraryKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  /**
   * Determine if web search is needed for this action
   */
  private shouldSearchWeb(action: ResearchAction, message: string): boolean {
    if (action === 'fact_check') return true;
    if (action === 'deep_dive') return true;
    if (action === 'background_context') return true;

    // Heuristic: search web for factual or current information
    const webKeywords = [
      'current', 'latest', 'recent', 'true', 'accurate', 'verify',
      'evidence', 'research', 'study', 'data', 'statistics',
    ];
    const lowerMessage = message.toLowerCase();
    return webKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  /**
   * Search the user's library for related content
   */
  private async searchLibrary(
    userId: string,
    query: string,
    context?: ResearchContext
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const libraryTool = this.tools.get('library_search');
    if (!libraryTool) {
      return { success: false, error: 'Library search tool not available' };
    }

    try {
      const result = await libraryTool.execute(
        {
          query,
          userId,
          filters: context?.bookId
            ? { excludeBookId: context.bookId }
            : undefined,
          limit: 10,
        },
        {} as ToolContext
      );

      if (result.success) {
        return { success: true, data: result.data };
      }

      return {
        success: false,
        error: result.error?.message || 'Library search failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Search the web for information
   */
  private async searchWeb(
    query: string,
    action: ResearchAction
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const webTool = this.tools.get('web_search');
    if (!webTool) {
      return { success: false, error: 'Web search tool not available' };
    }

    try {
      const searchDepth = action === 'deep_dive' || action === 'fact_check'
        ? 'advanced'
        : 'basic';
      const numResults = action === 'deep_dive' ? 10 : 5;

      const result = await webTool.execute(
        {
          query,
          numResults,
          searchDepth,
        },
        {} as ToolContext
      );

      if (result.success) {
        return { success: true, data: result.data };
      }

      return {
        success: false,
        error: result.error?.message || 'Web search failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ==========================================================================
  // Message Building
  // ==========================================================================

  /**
   * Build the enriched user message with context and tool results
   */
  private buildEnrichedMessage(
    message: string,
    action: ResearchAction,
    context: ResearchContext | undefined,
    toolResults: ResearchToolResult[]
  ): string {
    const parts: string[] = [];

    // Add reading context
    if (context) {
      const contextParts: string[] = [];

      if (context.bookTitle) {
        contextParts.push(`Book: "${context.bookTitle}" by ${context.bookAuthor || 'Unknown'}`);
      }

      if (context.selectedText) {
        contextParts.push(`Selected text: "${context.selectedText}"`);
      }

      if (context.currentPage !== undefined) {
        contextParts.push(`Current page: ${context.currentPage + 1}`);
      }

      if (context.chapterTitle) {
        contextParts.push(`Chapter: ${context.chapterTitle}`);
      }

      if (context.researchDepth) {
        contextParts.push(`Research depth: ${context.researchDepth}`);
      }

      if (contextParts.length > 0) {
        parts.push(`[Reading Context]\n${contextParts.join('\n')}`);
      }
    }

    // Add action type
    parts.push(`[Research Type: ${this.formatAction(action)}]`);

    // Add the actual message
    parts.push(message);

    // Append tool results
    const toolData = this.formatToolResults(toolResults);
    if (toolData) {
      parts.push(toolData);
    }

    return parts.join('\n\n');
  }

  /**
   * Format the action type for display
   */
  private formatAction(action: ResearchAction): string {
    const labels: Record<ResearchAction, string> = {
      deep_dive: 'Deep-Dive Analysis',
      cross_reference: 'Cross-Reference',
      background_context: 'Background Context',
      fact_check: 'Fact Check',
      explore_topic: 'Topic Exploration',
    };
    return labels[action];
  }

  /**
   * Format tool results into a readable section for the LLM
   */
  private formatToolResults(toolResults: ResearchToolResult[]): string | null {
    const successfulResults = toolResults.filter((r) => r.success && r.data);
    if (successfulResults.length === 0) return null;

    const sections: string[] = ['[Research Data]'];

    for (const result of successfulResults) {
      if (result.toolName === 'library_search' && result.data) {
        const data = result.data as {
          results?: Array<{
            document: { title: string; author: string };
            score: number;
            relevance: number;
          }>;
          total?: number;
        };
        if (data.results && data.results.length > 0) {
          sections.push('\n--- Related Content from Your Library ---');
          for (const item of data.results.slice(0, 5)) {
            sections.push(
              `- "${item.document.title}" by ${item.document.author} (relevance: ${(item.relevance * 100).toFixed(0)}%)`
            );
          }
        } else {
          sections.push('\n--- Library Search: No related content found ---');
        }
      }

      if (result.toolName === 'web_search' && result.data) {
        const data = result.data as {
          results?: Array<{
            title: string;
            url: string;
            snippet: string;
            source: string;
            relevanceScore: number;
          }>;
          total?: number;
        };
        if (data.results && data.results.length > 0) {
          sections.push('\n--- Web Research Sources ---');
          for (const item of data.results.slice(0, 5)) {
            sections.push(
              `- ${item.title} (${item.source}): ${item.snippet}`
            );
          }
        } else {
          sections.push('\n--- Web Search: No results found ---');
        }
      }
    }

    return sections.join('\n');
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  /**
   * Generate an appropriate error response based on the action and error type
   */
  private getErrorResponse(error: unknown, action: ResearchAction): string {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Check for specific error types
    if (errorMessage.includes('rate_limit') || errorMessage.includes('429')) {
      return 'I\'m currently handling too many research requests. Please try again in a moment, and I\'ll be happy to dig into this topic for you.';
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return 'The research is taking longer than expected. This sometimes happens with complex topics. Please try again, or consider narrowing your question for a quicker response.';
    }

    if (
      errorMessage.includes('authentication') ||
      errorMessage.includes('API key')
    ) {
      return 'I\'m experiencing a configuration issue that\'s preventing me from conducting research. This has been logged for the team to resolve.';
    }

    // Action-specific fallback messages
    switch (action) {
      case 'fact_check':
        return 'I wasn\'t able to verify this claim through my research tools. I\'d recommend checking authoritative sources directly. If you try again, I may be able to assist.';
      case 'deep_dive':
        return 'I encountered an issue while researching this topic. Please try rephrasing your question or asking about a specific aspect, and I\'ll attempt another deep-dive.';
      case 'cross_reference':
        return 'I wasn\'t able to search your library for related content at this time. Please try again shortly.';
      case 'background_context':
        return 'I\'m having trouble gathering background context right now. Please try again, and I\'ll work on providing the historical and cultural information you need.';
      default:
        return 'I apologize, but I encountered an issue with my research. Please try rephrasing your question or try again in a moment.';
    }
  }

  // ==========================================================================
  // History Management
  // ==========================================================================

  /**
   * Clear conversation history for a user
   */
  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
  }

  /**
   * Get conversation history for a user
   */
  getHistory(userId: string): ResearchMessage[] {
    return this.conversationHistory.get(userId) || [];
  }
}
