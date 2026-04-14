/**
 * Synthesis Agent - Cross-Document Analysis and Knowledge Synthesis
 *
 * The Synthesis Agent connects ideas across multiple books and builds
 * knowledge graphs. It is the "big picture" agent that helps readers
 * see how everything fits together.
 *
 * Core capabilities:
 * - Cross-document analysis: identify themes spanning multiple books
 * - Knowledge synthesis: combine insights from different sources
 * - Concept mapping: create visual concept maps of relationships
 * - Contradiction detection: find where different authors disagree
 * - Summary reports: generate comprehensive synthesis across library
 */

import type {
  AgentContext,
  AgentRequest,
  AgentResponse,
} from '../../types';
import { chatCompletion, DEFAULT_MODEL } from '../../services/llmClient';
import { BaseTool } from '../tools/BaseTool';
import { LibrarySearchTool } from '../tools/LibrarySearchTool';
import { sanitizePromptInput, wrapUserContent } from '../../utils/promptSanitizer';

// ============================================================================
// Configuration
// ============================================================================

interface SynthesisAgentConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface SynthesisMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================================
// Action Types
// ============================================================================

type SynthesisAction =
  | 'synthesize'
  | 'cross_reference'
  | 'concept_map'
  | 'find_contradictions'
  | 'summary_report';

// ============================================================================
// Input Types
// ============================================================================

interface SynthesisInput {
  query: string;
  bookIds?: string[];
  theme?: string;
  depth?: 'brief' | 'standard' | 'deep';
}

interface CrossReferenceInput {
  concept: string;
  sourceBookId: string;
  targetBookIds?: string[];
  analysisType?: 'supporting' | 'contradicting' | 'extending' | 'all';
}

interface ConceptMapInput {
  topic: string;
  bookIds?: string[];
  maxNodes?: number;
}

interface ContradictionInput {
  topic?: string;
  bookIds?: string[];
  minSeverity?: 'low' | 'medium' | 'high';
}

interface SummaryReportInput {
  bookIds?: string[];
  timeRange?: { start: string; end: string };
  focus?: string;
  format?: 'narrative' | 'structured' | 'academic';
}

// ============================================================================
// Output Types
// ============================================================================

interface SynthesisResult {
  themes: Theme[];
  connections: Connection[];
  synthesis: string;
}

interface CrossReferenceResult {
  concept: string;
  source: BookPassage;
  references: CrossReference[];
  analysis: string;
}

interface ConceptMapResult {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  summary: string;
}

interface ContradictionResult {
  contradictions: Contradiction[];
  analysis: string;
}

interface SummaryReportResult {
  report: string;
  themes: string[];
  booksCovered: number;
  insights: string[];
}

// ============================================================================
// Domain Types
// ============================================================================

interface Theme {
  name: string;
  description: string;
  bookIds: string[];
  strength: number;
}

interface Connection {
  sourceBookId: string;
  targetBookId: string;
  concept: string;
  relationship: string;
  evidence: string;
}

interface BookPassage {
  bookId: string;
  title: string;
  author: string;
  excerpt: string;
  location?: string;
}

interface CrossReference {
  book: BookPassage;
  type: 'supporting' | 'contradicting' | 'extending' | 'nuancing';
  explanation: string;
}

interface ConceptNode {
  id: string;
  label: string;
  type: 'concept' | 'book' | 'author' | 'theme';
  bookId?: string;
  weight: number;
}

interface ConceptEdge {
  source: string;
  target: string;
  label: string;
  strength: number;
}

interface Contradiction {
  topic: string;
  position1: { book: BookPassage; claim: string };
  position2: { book: BookPassage; claim: string };
  severity: 'low' | 'medium' | 'high';
  analysis: string;
}

// ============================================================================
// Synthesis Agent
// ============================================================================

export class SynthesisAgent {
  private config: Required<SynthesisAgentConfig>;
  private tools: Map<string, BaseTool>;
  private conversationHistory: Map<string, SynthesisMessage[]>;

  static readonly ACTIONS: SynthesisAction[] = [
    'synthesize',
    'cross_reference',
    'concept_map',
    'find_contradictions',
    'summary_report',
  ];

  constructor(config: SynthesisAgentConfig = {}) {
    this.config = {
      model: config.model || DEFAULT_MODEL,
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.6,
    };

    this.tools = new Map();
    this.conversationHistory = new Map();

    this.registerTool(new LibrarySearchTool());
  }

  /**
   * Register a tool for the agent to use
   */
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Main execution entry point following IAgent interface pattern
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      this.validateRequest(request);

      const { action, input, userId } = request;
      let result: unknown;
      let toolsUsed: string[] = [];
      let totalTokens = 0;

      switch (action as SynthesisAction) {
        case 'synthesize':
          ({ result, toolsUsed, totalTokens } = await this.synthesize(
            userId,
            input as SynthesisInput,
            request.context
          ));
          break;

        case 'cross_reference':
          ({ result, toolsUsed, totalTokens } = await this.crossReference(
            userId,
            input as CrossReferenceInput,
            request.context
          ));
          break;

        case 'concept_map':
          ({ result, toolsUsed, totalTokens } = await this.conceptMap(
            userId,
            input as ConceptMapInput,
            request.context
          ));
          break;

        case 'find_contradictions':
          ({ result, toolsUsed, totalTokens } = await this.findContradictions(
            userId,
            input as ContradictionInput,
            request.context
          ));
          break;

        case 'summary_report':
          ({ result, toolsUsed, totalTokens } = await this.summaryReport(
            userId,
            input as SummaryReportInput,
            request.context
          ));
          break;

        default:
          return {
            success: false,
            content: `Unknown action: ${action}. Supported actions: ${SynthesisAgent.ACTIONS.join(', ')}`,
            error: {
              code: 'INVALID_ACTION',
              message: `Unsupported action: ${action}`,
              recoverable: true,
            },
          };
      }

      const duration = Date.now() - startTime;

      const resultRecord = result as Record<string, unknown>;
      const content =
        (typeof resultRecord['analysis'] === 'string' ? resultRecord['analysis'] : null)
        || (typeof resultRecord['synthesis'] === 'string' ? resultRecord['synthesis'] : null)
        || (typeof resultRecord['summary'] === 'string' ? resultRecord['summary'] : null)
        || JSON.stringify(result);

      return {
        success: true,
        content,
        data: result,
        metadata: {
          modelUsed: this.config.model,
          tokensUsed: totalTokens,
          cost: this.estimateCost(totalTokens),
          duration,
          toolsUsed,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        content: this.getErrorMessage(error),
        error: {
          code: this.getErrorCode(error),
          message: error instanceof Error ? error.message : String(error),
          recoverable: this.isRecoverable(error),
        },
        metadata: {
          modelUsed: this.config.model,
          tokensUsed: 0,
          cost: 0,
          duration,
        },
      };
    }
  }

  // ==========================================================================
  // Core Actions
  // ==========================================================================

  /**
   * Synthesize insights across multiple books around a query or theme
   */
  private async synthesize(
    userId: string,
    input: SynthesisInput,
    context?: AgentContext
  ): Promise<{ result: SynthesisResult; toolsUsed: string[]; totalTokens: number }> {
    const toolsUsed: string[] = [];
    const { query, bookIds, theme, depth = 'standard' } = input;

    // Search the library for relevant content
    const searchResults = await this.searchLibrary(userId, query, {
      bookIds,
      limit: depth === 'brief' ? 5 : depth === 'deep' ? 20 : 10,
    });

    if (searchResults) {
      toolsUsed.push('library_search');
    }

    // Build the prompt for synthesis
    const depthInstruction = this.getDepthInstruction(depth);
    const contextBlock = this.buildContextBlock(context);
    const libraryContext = searchResults
      ? this.formatLibraryContext(searchResults)
      : '';

    const prompt = `I need you to synthesize insights across multiple sources.

Query: ${query}
${theme ? `Theme: ${theme}` : ''}
${depthInstruction}
${contextBlock}

${libraryContext}

Please provide:
1. Key themes that emerge across these sources
2. Specific connections between the works
3. A synthesized understanding that weaves these insights together`;

    const response = await this.callLLM(prompt, userId);
    const themes = this.extractThemes(response);
    const connections = this.extractConnections(response, searchResults);

    return {
      result: {
        themes,
        connections,
        synthesis: response,
      },
      toolsUsed,
      totalTokens: 0,
    };
  }

  /**
   * Cross-reference a concept between a source book and other works
   */
  private async crossReference(
    userId: string,
    input: CrossReferenceInput,
    context?: AgentContext
  ): Promise<{ result: CrossReferenceResult; toolsUsed: string[]; totalTokens: number }> {
    const toolsUsed: string[] = [];
    const { concept, sourceBookId, targetBookIds, analysisType = 'all' } = input;

    // Search for the concept across the library
    const searchResults = await this.searchLibrary(userId, concept, {
      excludeBookId: sourceBookId,
      bookIds: targetBookIds,
      limit: 15,
    });

    if (searchResults) {
      toolsUsed.push('library_search');
    }

    // Also search for source book content
    const sourceResults = await this.searchLibrary(userId, concept, {
      bookIds: [sourceBookId],
      limit: 5,
    });

    const sourceBook = sourceResults?.results?.[0];
    const sourcePassage: BookPassage = {
      bookId: sourceBookId,
      title: sourceBook?.document?.title || 'Source Book',
      author: sourceBook?.document?.author || 'Unknown Author',
      excerpt: this.extractDescription(sourceBook?.document?.metadata) || '',
    };

    const references: CrossReference[] = [];
    if (searchResults?.results) {
      for (const match of searchResults.results) {
        const type = this.inferReferenceType(concept, analysisType);
        references.push({
          book: {
            bookId: match.document.id,
            title: match.document.title,
            author: match.document.author,
            excerpt: this.extractDescription(match.document.metadata) || '',
          },
          type,
          explanation: `Discusses "${concept}" with relevance score ${match.relevance.toFixed(2)}`,
        });
      }
    }

    const contextBlock = this.buildContextBlock(context);
    const libraryContext = searchResults
      ? this.formatLibraryContext(searchResults)
      : '';

    const prompt = `I need you to analyze how the concept "${concept}" appears across different works.

Source book: ${sourcePassage.title} by ${sourcePassage.author}
Analysis type: ${analysisType}
${contextBlock}

${libraryContext}

Please analyze:
1. How does each work approach this concept?
2. Where do they agree, disagree, or extend each other?
3. What unique perspective does each work bring?`;

    const analysis = await this.callLLM(prompt, userId);

    return {
      result: {
        concept,
        source: sourcePassage,
        references,
        analysis,
      },
      toolsUsed,
      totalTokens: 0,
    };
  }

  /**
   * Generate a concept map showing relationships between ideas across books
   */
  private async conceptMap(
    userId: string,
    input: ConceptMapInput,
    context?: AgentContext
  ): Promise<{ result: ConceptMapResult; toolsUsed: string[]; totalTokens: number }> {
    const toolsUsed: string[] = [];
    const { topic, bookIds, maxNodes = 20 } = input;

    // Search for the topic across the library
    const searchResults = await this.searchLibrary(userId, topic, {
      bookIds,
      limit: 15,
    });

    if (searchResults) {
      toolsUsed.push('library_search');
    }

    const contextBlock = this.buildContextBlock(context);
    const libraryContext = searchResults
      ? this.formatLibraryContext(searchResults)
      : '';

    const prompt = `I need you to create a concept map for the topic "${topic}".

${contextBlock}

${libraryContext}

Please generate a concept map with up to ${maxNodes} nodes. For each element, provide:
1. Nodes as JSON objects with: id, label, type (concept/book/author/theme), weight (0-1)
2. Edges as JSON objects with: source (id), target (id), label (relationship), strength (0-1)

Output format - first provide a brief summary, then the structured data as JSON:

SUMMARY:
[Your summary here]

NODES:
[{"id": "...", "label": "...", "type": "...", "weight": 0.8}, ...]

EDGES:
[{"source": "...", "target": "...", "label": "...", "strength": 0.7}, ...]`;

    const response = await this.callLLM(prompt, userId);
    const { nodes, edges, summary } = this.parseConceptMapResponse(response, maxNodes);

    return {
      result: { nodes, edges, summary },
      toolsUsed,
      totalTokens: 0,
    };
  }

  /**
   * Find contradictions and disagreements between different works
   */
  private async findContradictions(
    userId: string,
    input: ContradictionInput,
    context?: AgentContext
  ): Promise<{ result: ContradictionResult; toolsUsed: string[]; totalTokens: number }> {
    const toolsUsed: string[] = [];
    const { topic, bookIds, minSeverity = 'medium' } = input;

    const searchQuery = topic
      ? `${topic} differing perspectives contrasting views`
      : 'contradicting perspectives differing opinions';

    const searchResults = await this.searchLibrary(userId, searchQuery, {
      bookIds,
      limit: 15,
    });

    if (searchResults) {
      toolsUsed.push('library_search');
    }

    const contextBlock = this.buildContextBlock(context);
    const libraryContext = searchResults
      ? this.formatLibraryContext(searchResults)
      : '';

    const severityFilter = this.getSeverityFilter(minSeverity);

    const prompt = `I need you to identify contradictions and disagreements across these sources.
${topic ? `Topic focus: ${topic}` : 'General analysis across all topics'}
Minimum severity: ${minSeverity}

${severityFilter}

${contextBlock}

${libraryContext}

For each contradiction found, provide:
1. The topic of disagreement
2. Position from one work (with source)
3. Contrasting position from another work (with source)
4. Severity (low = minor detail difference, medium = significant disagreement, high = fundamental opposition)
5. Your analysis of why they disagree and who might be right (or if context matters)

Be thorough but fair. Not all differences are contradictions - sometimes different contexts
or definitions lead to surface-level disagreements that resolve on deeper analysis.`;

    const response = await this.callLLM(prompt, userId);
    const contradictions = this.parseContradictions(response, searchResults, minSeverity);

    return {
      result: {
        contradictions,
        analysis: response,
      },
      toolsUsed,
      totalTokens: 0,
    };
  }

  /**
   * Generate a comprehensive summary report across the user's library
   */
  private async summaryReport(
    userId: string,
    input: SummaryReportInput,
    context?: AgentContext
  ): Promise<{ result: SummaryReportResult; toolsUsed: string[]; totalTokens: number }> {
    const toolsUsed: string[] = [];
    const { bookIds, timeRange, focus, format = 'structured' } = input;

    // Search broadly to capture the user's reading landscape
    const searchQuery = focus || 'main ideas key concepts themes arguments';
    const searchResults = await this.searchLibrary(userId, searchQuery, {
      bookIds,
      limit: 20,
    });

    if (searchResults) {
      toolsUsed.push('library_search');
    }

    const contextBlock = this.buildContextBlock(context);
    const libraryContext = searchResults
      ? this.formatLibraryContext(searchResults)
      : '';

    const formatInstruction = this.getFormatInstruction(format);

    const prompt = `Generate a comprehensive synthesis report across the user's reading library.

${focus ? `Focus area: ${focus}` : 'Broad synthesis across all readings'}
${timeRange ? `Time range: ${timeRange.start} to ${timeRange.end}` : ''}
Format: ${formatInstruction}

${contextBlock}

${libraryContext}

Please create a report that includes:
1. An executive summary of the intellectual landscape
2. Key themes that recur across multiple works
3. How different authors build on or challenge each other
4. Unique insights from specific works
5. An overall synthesis - what does reading all of these together reveal?

The report should feel like a brilliant academic helping the reader see the big picture
of their intellectual journey.`;

    const response = await this.callLLM(prompt, userId);
    const themes = this.extractThemesFromReport(response);
    const insights = this.extractInsightsFromReport(response);
    const booksCovered = searchResults?.results?.length || 0;

    return {
      result: {
        report: response,
        themes,
        booksCovered,
        insights,
      },
      toolsUsed,
      totalTokens: 0,
    };
  }

  // ==========================================================================
  // System Prompt
  // ==========================================================================

  /**
   * Get the system prompt for the Synthesis Agent
   */
  private getSystemPrompt(): string {
    return `You are the Synthesis Agent for read-pal, an AI reading companion application.

## Your Purpose
You connect ideas across multiple books and help readers see the big picture. You are a brilliant academic who excels at finding patterns, drawing connections, and synthesizing knowledge from diverse sources.

## Your Responsibilities
- Identify themes and concepts that span multiple works
- Draw meaningful connections between different authors' ideas
- Create visual concept maps showing relationships between ideas
- Detect genuine contradictions and disagreements between works
- Generate comprehensive synthesis reports that illuminate intellectual landscapes
- Distinguish between true contradictions and context-dependent differences

## Your Personality
- Intellectually rigorous but accessible
- Enthusiastic about ideas and connections ("This is where it gets fascinating...")
- Precise and analytical, never vague
- Fair and balanced in presenting disagreements
- Occasionally surprised and delighted by unexpected connections
- Like a favorite professor who makes complex ideas click

## How You Communicate
- Use clear, well-structured prose
- Support claims with specific references to works
- Use phrases like "What's remarkable here is..." or "Notice how these two works..."
- When presenting disagreements, present both sides before analyzing
- Conclude with synthesis, not just summary

## Available Tools
${this.getToolDescriptions()}

## Constraints
- Never invent citations or claim a book says something it doesn't
- Acknowledge when evidence is insufficient for a strong claim
- Distinguish between correlation and causation in connections
- Present contradictions fairly without favoring one side
- Note when "contradictions" may stem from different contexts or definitions
- Be transparent about confidence levels in your analysis

Remember: You are an AI assistant helping someone understand how ideas connect across their reading. Be intellectually honest, rigorous, and genuinely excited about the pursuit of knowledge.`;
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
  // Library Search Helper
  // ==========================================================================

  /**
   * Search the user's library with error handling and optional filtering
   */
  private async searchLibrary(
    userId: string,
    query: string,
    options?: {
      bookIds?: string[];
      excludeBookId?: string;
      limit?: number;
    }
  ): Promise<{
    results: Array<{
      document: {
        id: string;
        title: string;
        author: string;
        type: string;
        metadata?: Record<string, unknown>;
      };
      score: number;
      relevance: number;
    }>;
    total: number;
    query: string;
  } | null> {
    const libraryTool = this.tools.get('library_search');
    if (!libraryTool) {
      return null;
    }

    try {
      const result = await libraryTool.execute(
        {
          query,
          userId,
          filters: {
            excludeBookId: options?.excludeBookId,
            bookIds: options?.bookIds,
          },
          limit: options?.limit || 10,
        },
        { userId, sessionId: 'synthesis', agentName: 'synthesis-agent', db: null as unknown as never, logger: null as unknown as never }
      );

      if (result.success && result.data) {
        return result.data as Awaited<ReturnType<typeof this.searchLibrary>>;
      }
      return null;
    } catch (error) {
      console.error('Synthesis Agent: library search failed:', error);
      return null;
    }
  }

  // ==========================================================================
  // Claude API Integration
  // ==========================================================================

  /**
   * Call LLM with the synthesis-optimized prompt
   */
  private async callLLM(prompt: string, userId: string): Promise<string> {
    // Get or create conversation history
    let history = this.conversationHistory.get(userId);
    if (!history) {
      history = [];
      this.conversationHistory.set(userId, history);
    }

    const safePrompt = sanitizePromptInput(prompt, 'Synthesis Query');

    const messages = [
      ...history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: wrapUserContent(safePrompt, 'Synthesis Query') },
    ];

    const responseText = await chatCompletion({
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: this.getSystemPrompt(),
      messages,
    });

    // Update conversation history
    history.push({ role: 'user', content: prompt });
    history.push({ role: 'assistant', content: responseText });

    // Keep history manageable (last 16 messages for synthesis context)
    if (history.length > 16) {
      history.splice(0, history.length - 16);
    }

    return responseText;
  }

  // ==========================================================================
  // Response Parsing Helpers
  // ==========================================================================

  /**
   * Extract themes from a synthesis response
   */
  private extractThemes(response: string): Theme[] {
    const themes: Theme[] = [];
    const themeRegex = /(?:^|\n)(?:\d+\.\s*)?\*?\*?([^*:.\n]{5,60})\*?\*?\s*[:–—-]\s*([^.\n]+)/gi;

    let match;
    while ((match = themeRegex.exec(response)) !== null) {
      themes.push({
        name: match[1].trim(),
        description: match[2].trim(),
        bookIds: [],
        strength: 0.7,
      });
    }

    return themes.slice(0, 10);
  }

  /**
   * Extract connections from a synthesis response using search results
   */
  private extractConnections(
    response: string,
    searchResults: Awaited<ReturnType<typeof this.searchLibrary>>
  ): Connection[] {
    const connections: Connection[] = [];

    if (!searchResults?.results || searchResults.results.length < 2) {
      return connections;
    }

    const results = searchResults.results;
    for (let i = 0; i < Math.min(results.length, 5); i++) {
      for (let j = i + 1; j < Math.min(results.length, 5); j++) {
        connections.push({
          sourceBookId: results[i].document.id,
          targetBookId: results[j].document.id,
          concept: 'related themes',
          relationship: 'shares themes with',
          evidence: `Both works appear relevant to the query "${searchResults.query}"`,
        });
      }
    }

    return connections;
  }

  /**
   * Parse a concept map response from Claude into structured nodes and edges
   */
  private parseConceptMapResponse(
    response: string,
    maxNodes: number
  ): { nodes: ConceptNode[]; edges: ConceptEdge[]; summary: string } {
    const nodes: ConceptNode[] = [];
    const edges: ConceptEdge[] = [];
    let summary = response;

    // Try to extract structured JSON from the response
    try {
      // Extract summary (text before NODES marker)
      const summaryMatch = response.match(/^([\s\S]*?)(?=NODES:|$)/i);
      if (summaryMatch) {
        summary = summaryMatch[1]
          .replace(/^SUMMARY:\s*/i, '')
          .trim();
      }

      // Extract nodes
      const nodesMatch = response.match(/NODES:\s*\n?(\[[\s\S]*?\])(?=\n\n|\nEDGES:|$)/i);
      if (nodesMatch) {
        const parsedNodes = JSON.parse(nodesMatch[1]);
        for (const n of parsedNodes.slice(0, maxNodes)) {
          nodes.push({
            id: String(n.id || `node_${nodes.length}`),
            label: String(n.label || 'Unknown'),
            type: ['concept', 'book', 'author', 'theme'].includes(n.type)
              ? n.type
              : 'concept',
            bookId: n.bookId ? String(n.bookId) : undefined,
            weight: typeof n.weight === 'number' ? n.weight : 0.5,
          });
        }
      }

      // Extract edges
      const edgesMatch = response.match(/EDGES:\s*\n?(\[[\s\S]*?\])\s*$/i);
      if (edgesMatch) {
        const parsedEdges = JSON.parse(edgesMatch[1]);
        for (const e of parsedEdges) {
          edges.push({
            source: String(e.source || ''),
            target: String(e.target || ''),
            label: String(e.label || 'related to'),
            strength: typeof e.strength === 'number' ? e.strength : 0.5,
          });
        }
      }
    } catch {
      // If parsing fails, create basic nodes from the response
      const words = response.split(/\s+/).filter(w => w.length > 5);
      const uniqueWords = [...new Set(words)].slice(0, maxNodes);
      for (const word of uniqueWords) {
        nodes.push({
          id: `node_${nodes.length}`,
          label: word,
          type: 'concept',
          weight: 0.5,
        });
      }
    }

    // If no summary was extracted, use the full response
    if (!summary || summary.length < 20) {
      summary = response.slice(0, 500);
    }

    return { nodes, edges, summary };
  }

  /**
   * Parse contradictions from a response
   */
  private parseContradictions(
    response: string,
    searchResults: Awaited<ReturnType<typeof this.searchLibrary>>,
    minSeverity: 'low' | 'medium' | 'high'
  ): Contradiction[] {
    const contradictions: Contradiction[] = [];
    const results = searchResults?.results || [];

    // Extract contradiction sections from the response
    const sections = response.split(/(?=\d+\.\s|\n(?=Contradiction|Disagreement|Difference))/i);

    for (const section of sections.slice(0, 10)) {
      if (section.trim().length < 50) continue;

      // Try to determine severity
      const severity = this.detectSeverity(section, minSeverity);

      // Find references to books in this section
      const bookRefs = results.filter(
        (r) =>
          section.toLowerCase().includes(r.document.title.toLowerCase()) ||
          section.toLowerCase().includes(r.document.author.toLowerCase())
      );

      if (bookRefs.length >= 2 || section.toLowerCase().includes('disagree') || section.toLowerCase().includes('contradict')) {
        contradictions.push({
          topic: this.extractTopicFromSection(section),
          position1: {
            book: bookRefs[0]
              ? {
                  bookId: bookRefs[0].document.id,
                  title: bookRefs[0].document.title,
                  author: bookRefs[0].document.author,
                  excerpt: '',
                }
              : { bookId: '', title: 'Work A', author: 'Author A', excerpt: '' },
            claim: section.slice(0, 200),
          },
          position2: {
            book: bookRefs[1]
              ? {
                  bookId: bookRefs[1].document.id,
                  title: bookRefs[1].document.title,
                  author: bookRefs[1].document.author,
                  excerpt: '',
                }
              : { bookId: '', title: 'Work B', author: 'Author B', excerpt: '' },
            claim: section.slice(200, 400),
          },
          severity,
          analysis: section.slice(0, 500),
        });
      }
    }

    // Filter by minimum severity
    const severityOrder = { low: 0, medium: 1, high: 2 };
    const minOrder = severityOrder[minSeverity];
    return contradictions.filter(
      (c) => severityOrder[c.severity] >= minOrder
    );
  }

  /**
   * Extract themes from a summary report
   */
  private extractThemesFromReport(report: string): string[] {
    const themes: string[] = [];

    // Look for numbered lists or bullet points
    const listRegex = /(?:^|\n)(?:\d+\.\s*|[-*]\s*)\*?\*?([^*:\n]{5,80})\*?\*?/g;
    let match;
    while ((match = listRegex.exec(report)) !== null) {
      const theme = match[1].trim();
      if (theme.length > 5 && theme.length < 80 && !themes.includes(theme)) {
        themes.push(theme);
      }
    }

    return themes.slice(0, 10);
  }

  /**
   * Extract key insights from a summary report
   */
  private extractInsightsFromReport(report: string): string[] {
    const insights: string[] = [];

    // Look for insight-like sentences
    const sentences = report.split(/[.!?]+/).filter(s => s.trim().length > 30);
    const insightKeywords = [
      'reveals', 'shows', 'suggests', 'demonstrates', 'indicates',
      'highlights', 'connects', 'interesting', 'remarkable', 'notably',
      'surprisingly', 'key insight', 'important', 'significant',
    ];

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (insightKeywords.some(kw => lower.includes(kw))) {
        insights.push(sentence.trim());
      }
    }

    return insights.slice(0, 8);
  }

  // ==========================================================================
  // Formatting and Utility Helpers
  // ==========================================================================

  /**
   * Format library search results into context for Claude
   */
  private formatLibraryContext(
    results: NonNullable<Awaited<ReturnType<typeof this.searchLibrary>>>
  ): string {
    if (!results.results || results.results.length === 0) {
      return 'No relevant content found in the user\'s library.';
    }

    const formatted = results.results.map((r, i) => {
      const desc = this.extractDescription(r.document.metadata);
      return `${i + 1}. "${r.document.title}" by ${r.document.author} (relevance: ${(r.relevance * 100).toFixed(0)}%)${desc ? `\n   ${desc.slice(0, 300)}` : ''}`;
    });

    return `## Sources from the user's library:\n${formatted.join('\n\n')}`;
  }

  /**
   * Safely extract the description string from book metadata
   */
  private extractDescription(metadata?: Record<string, unknown>): string | undefined {
    if (!metadata || typeof metadata['description'] !== 'string') {
      return undefined;
    }
    return metadata['description'];
  }

  /**
   * Build a context block from the agent context
   */
  private buildContextBlock(context?: AgentContext): string {
    if (!context) return '';

    const parts: string[] = [];

    if (context.currentBook) {
      parts.push(`Currently reading: "${sanitizePromptInput(context.currentBook.title, 'Book Title')}" by ${sanitizePromptInput(context.currentBook.author, 'Author')}`);
    }

    if (context.userUnderstandingLevel) {
      parts.push(`Reader level: ${context.userUnderstandingLevel}`);
    }

    if (context.readingLocation) {
      parts.push(`Reading location: ${context.readingLocation.type} ${context.readingLocation.value}`);
    }

    return parts.length > 0 ? `## Context\n${parts.join('\n')}` : '';
  }

  /**
   * Get depth-appropriate instruction text
   */
  private getDepthInstruction(depth: 'brief' | 'standard' | 'deep'): string {
    switch (depth) {
      case 'brief':
        return 'Provide a concise synthesis (2-3 paragraphs). Focus on the most significant connections only.';
      case 'deep':
        return 'Provide a deep, thorough analysis. Explore subtle connections, consider multiple interpretations, and provide detailed evidence for each claim.';
      default:
        return 'Provide a balanced synthesis with the most important themes and connections.';
    }
  }

  /**
   * Get severity filter instruction for contradiction analysis
   */
  private getSeverityFilter(minSeverity: 'low' | 'medium' | 'high'): string {
    switch (minSeverity) {
      case 'high':
        return 'Only report fundamental disagreements where authors take opposing positions on core claims.';
      case 'medium':
        return 'Report significant disagreements. Exclude minor differences in phrasing or emphasis that don\'t affect the substance.';
      default:
        return 'Report all notable differences, including minor variations in perspective or emphasis.';
    }
  }

  /**
   * Get format instruction for summary reports
   */
  private getFormatInstruction(format: 'narrative' | 'structured' | 'academic'): string {
    switch (format) {
      case 'narrative':
        return 'Write in a flowing narrative style, like an essay. Use paragraphs and natural transitions between ideas.';
      case 'academic':
        return 'Use academic formatting with sections, subsections, citations, and formal analysis language.';
      default:
        return 'Use a structured format with clear sections, bullet points for key findings, and headers for organization.';
    }
  }

  /**
   * Infer the reference type for a cross-reference
   */
  private inferReferenceType(
    concept: string,
    analysisType: 'supporting' | 'contradicting' | 'extending' | 'all'
  ): 'supporting' | 'contradicting' | 'extending' | 'nuancing' {
    if (analysisType !== 'all') return analysisType;
    return 'nuancing';
  }

  /**
   * Detect severity level from a contradiction section
   */
  private detectSeverity(
    section: string,
    minSeverity: 'low' | 'medium' | 'high'
  ): 'low' | 'medium' | 'high' {
    const lower = section.toLowerCase();

    if (
      lower.includes('fundamental') ||
      lower.includes('diametrically') ||
      lower.includes('directly contradicts') ||
      lower.includes('completely opposite')
    ) {
      return 'high';
    }

    if (
      lower.includes('significant') ||
      lower.includes('disagree') ||
      lower.includes('contradict') ||
      lower.includes('conflict')
    ) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Extract the topic from a contradiction section
   */
  private extractTopicFromSection(section: string): string {
    // Try to find the topic from the first sentence or heading
    const firstLine = section.split('\n')[0];
    const topicMatch = firstLine.match(
      /(?:about|on|regarding|concerning|over)\s+["']?([^"'.]+)["']?/i
    );
    if (topicMatch) {
      return topicMatch[1].trim();
    }
    return firstLine.slice(0, 60).trim();
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  /**
   * Validate an incoming request
   */
  private validateRequest(request: AgentRequest): void {
    if (!request.userId) {
      throw new SynthesisAgentError('MISSING_USER_ID', 'User ID is required', true);
    }

    if (!request.action) {
      throw new SynthesisAgentError('MISSING_ACTION', 'Action is required', true);
    }

    if (!request.input) {
      throw new SynthesisAgentError('MISSING_INPUT', 'Input is required', true);
    }

    if (!SynthesisAgent.ACTIONS.includes(request.action as SynthesisAction)) {
      throw new SynthesisAgentError(
        'INVALID_ACTION',
        `Invalid action: ${request.action}. Supported: ${SynthesisAgent.ACTIONS.join(', ')}`,
        true
      );
    }
  }

  /**
   * Get a user-friendly error message
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof SynthesisAgentError) {
      switch (error.code) {
        case 'MISSING_USER_ID':
          return 'I need to know who you are to search your library. Please provide your user ID.';
        case 'MISSING_ACTION':
          return 'Please specify what you would like me to do. I can synthesize, cross-reference, create concept maps, find contradictions, or generate reports.';
        case 'MISSING_INPUT':
          return 'I need more information to work with. Please provide a query or topic.';
        case 'INVALID_ACTION':
          return error.message;
        case 'ANALYSIS_FAILED':
          return 'I encountered an issue while analyzing your library. Let me try a different approach.';
        default:
          return 'Something went wrong with the analysis. Please try again.';
      }
    }

    return 'I encountered an unexpected issue while synthesizing your readings. Please try again or rephrase your request.';
  }

  /**
   * Get an error code from an unknown error
   */
  private getErrorCode(error: unknown): string {
    if (error instanceof SynthesisAgentError) {
      return error.code;
    }
    if (error instanceof Error) {
      if (error.message.includes('API key')) return 'AUTH_ERROR';
      if (error.message.includes('rate limit')) return 'RATE_LIMIT';
      if (error.message.includes('timeout')) return 'TIMEOUT';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Determine if an error is recoverable
   */
  private isRecoverable(error: unknown): boolean {
    if (error instanceof SynthesisAgentError) {
      return error.recoverable;
    }
    return true;
  }

  /**
   * Estimate cost based on token usage
   */
  private estimateCost(tokensUsed: number): number {
    // Opus pricing: ~$15 per million input tokens, $75 per million output tokens
    // Using a blended average for simplicity
    const costPerThousandTokens = 0.045;
    return (tokensUsed / 1000) * costPerThousandTokens;
  }

  // ==========================================================================
  // Public Utility Methods
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
  getHistory(userId: string): SynthesisMessage[] {
    return this.conversationHistory.get(userId) || [];
  }

  /**
   * Get the list of supported actions
   */
  getSupportedActions(): string[] {
    return [...SynthesisAgent.ACTIONS];
  }
}

// ============================================================================
// Custom Error Class
// ============================================================================

class SynthesisAgentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recoverable: boolean
  ) {
    super(message);
    this.name = 'SynthesisAgentError';
  }
}
