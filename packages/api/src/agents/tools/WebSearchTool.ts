// ============================================================================
// Web Search Tool
// ============================================================================

import type {
  ToolCategory,
  ToolContext,
  ToolResult,
} from '../../types';
import { BaseTool } from './BaseTool';

/**
 * Web Search Tool
 *
 * Searches the web for current information to verify claims,
 * find additional context, or get up-to-date data.
 */
export class WebSearchTool extends BaseTool {
  readonly name = 'web_search';
  readonly description = 'Search the web for current information to verify claims, find additional context, or get up-to-date data beyond the user\'s library.';
  readonly category = 'external' as ToolCategory;
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The search query'
      },
      numResults: {
        type: 'number',
        description: 'Number of results to return (default: 5, max: 20)',
        default: 5
      },
      searchDepth: {
        type: 'string',
        description: 'Search depth - basic for faster results, advanced for comprehensive search',
        enum: ['basic', 'advanced'],
        default: 'basic'
      }
    },
    required: ['query']
  };

  /**
   * Execute web search
   */
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    // Validate input
    const validation = this.validateInput(input);
    if (!validation.valid) {
      return {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: validation.errors?.join(', ') || 'Invalid input'
        }
      };
    }

    const params = input as WebSearchParams;
    const numResults = Math.min(params.numResults || 5, 20);

    context.logger.info('Web search', {
      query: params.query,
      numResults,
      depth: params.searchDepth
    });

    try {
      // Perform search using DuckDuckGo (or other search API)
      const results = await this.performSearch(
        params.query,
        numResults,
        params.searchDepth || 'basic'
      );

      context.logger.info('Web search completed', {
        query: params.query,
        results: results.length
      });

      return {
        success: true,
        data: {
          results,
          query: params.query,
          total: results.length
        }
      };

    } catch (error) {
      context.logger.error('Web search failed', {
        query: params.query,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Perform the actual search.
   *
   * Strategy:
   *  1. Try the DuckDuckGo Instant Answer API (no key required).
   *  2. If that yields no results, try the DuckDuckGo HTML SERP scrape.
   *  3. Fall back to mock results when no API is reachable (dev/offline).
   */
  private async performSearch(
    query: string,
    numResults: number,
    depth: 'basic' | 'advanced'
  ): Promise<WebSearchResult[]> {
    // --- Attempt 1: DuckDuckGo Instant Answer API ---
    try {
      const instantResults = await this.searchDuckDuckGoInstant(query, numResults);
      if (instantResults.length > 0) {
        return instantResults;
      }
    } catch {
      // Intentionally swallowed – fall through to next strategy
    }

    // --- Attempt 2: DuckDuckGo HTML SERP ---
    try {
      const serpResults = await this.searchDuckDuckGoHtml(query, numResults);
      if (serpResults.length > 0) {
        return serpResults;
      }
    } catch {
      // Search unavailable – return empty rather than fabricated results
    }

    // Return empty results when search is unavailable.
    // Never return fabricated/mock URLs — integrity risk.
    return [];
  }

  // --------------------------------------------------------------------------
  // DuckDuckGo Instant Answer API
  // --------------------------------------------------------------------------

  /**
   * Query the DuckDuckGo Instant Answer API.
   * No API key is needed, but it only returns a few high-quality abstract results.
   */
  private async searchDuckDuckGoInstant(
    query: string,
    numResults: number,
  ): Promise<WebSearchResult[]> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'read-pal/1.0' },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo API returned ${response.status}`);
    }

    const data = await response.json() as DuckDuckGoResponse;
    const results: WebSearchResult[] = [];

    // Abstract result (Wikipedia-style summary)
    if (data.Abstract) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || '',
        snippet: data.Abstract,
        source: data.AbstractSource || 'DuckDuckGo',
        publishedDate: new Date().toISOString(),
        relevanceScore: 0.95,
      });
    }

    // Infobox (key-value summary)
    if (data.Infobox?.content) {
      for (const item of data.Infobox.content.slice(0, 2)) {
        if (item.label && item.value) {
          results.push({
            title: `${item.label} – ${query}`,
            url: item.wiki_order ? `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}` : '',
            snippet: `${item.label}: ${item.value}`,
            source: 'DuckDuckGo Infobox',
            publishedDate: new Date().toISOString(),
            relevanceScore: 0.85,
          });
        }
      }
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= numResults) break;
        if (typeof topic === 'object' && topic.Text) {
          results.push({
            title: topic.Text.slice(0, 80),
            url: topic.FirstURL || '',
            snippet: topic.Text,
            source: 'DuckDuckGo Related',
            publishedDate: new Date().toISOString(),
            relevanceScore: 0.7,
          });
        }
      }
    }

    return results.slice(0, numResults);
  }

  // --------------------------------------------------------------------------
  // DuckDuckGo HTML SERP
  // --------------------------------------------------------------------------

  /**
   * Scrape the DuckDuckGo HTML search results page.
   * This is a lightweight fallback that requires no API key and returns
   * standard organic search results.
   */
  private async searchDuckDuckGoHtml(
    query: string,
    numResults: number,
  ): Promise<WebSearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; read-pal/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo HTML returned ${response.status}`);
    }

    const html = await response.text();
    return this.parseDuckDuckGoHtml(html, numResults);
  }

  /**
   * Parse the DuckDuckGo HTML SERP into structured results.
   * The HTML page uses predictable class names for each result block.
   */
  private parseDuckDuckGoHtml(html: string, numResults: number): WebSearchResult[] {
    const results: WebSearchResult[] = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const resultUrls: Array<{ url: string; title: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = resultRegex.exec(html)) !== null) {
      resultUrls.push({
        url: match[1],
        title: this.stripHtmlTags(match[2]).trim(),
      });
    }

    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(this.stripHtmlTags(match[1]).trim());
    }

    for (let i = 0; i < Math.min(resultUrls.length, numResults); i++) {
      const result = resultUrls[i];
      if (!result.url || result.url.startsWith('/')) continue;

      results.push({
        title: result.title || 'Untitled',
        url: result.url,
        snippet: snippets[i] || '',
        source: new URL(result.url).hostname,
        publishedDate: new Date().toISOString(),
        relevanceScore: Math.max(0.9 - i * 0.1, 0.3),
      });
    }

    return results;
  }

  /**
   * Remove HTML tags from a string.
   */
  private stripHtmlTags(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Get mock search results (for development)
   */
  private getMockResults(query: string, numResults: number): WebSearchResult[] {
    const mockResults: WebSearchResult[] = [
      {
        title: `${query} - Wikipedia`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        snippet: `Comprehensive article about ${query} with detailed information, history, and references.`,
        source: 'Wikipedia',
        publishedDate: new Date().toISOString(),
        relevanceScore: 0.95
      },
      {
        title: `Understanding ${query}: A Complete Guide`,
        url: `https://example.com/${encodeURIComponent(query)}`,
        snippet: `In-depth guide covering all aspects of ${query}, from basics to advanced topics.`,
        source: 'Example.com',
        publishedDate: new Date(Date.now() - 86400000 * 30).toISOString(),
        relevanceScore: 0.82
      },
      {
        title: `${query} Explained Simply`,
        url: `https://simple-explanation.com/${encodeURIComponent(query)}`,
        snippet: `A beginner-friendly explanation of ${query} with examples and analogies.`,
        source: 'Simple Explanation',
        publishedDate: new Date(Date.now() - 86400000 * 60).toISOString(),
        relevanceScore: 0.75
      },
      {
        title: `Latest Research on ${query}`,
        url: `https://research-hub.com/${encodeURIComponent(query)}`,
        snippet: `Recent studies and findings about ${query} from leading researchers in the field.`,
        source: 'Research Hub',
        publishedDate: new Date(Date.now() - 86400000 * 7).toISOString(),
        relevanceScore: 0.68
      },
      {
        title: `Practical Applications of ${query}`,
        url: `https://practical-guide.com/${encodeURIComponent(query)}`,
        snippet: `How ${query} is used in real-world scenarios and practical applications.`,
        source: 'Practical Guide',
        publishedDate: new Date(Date.now() - 86400000 * 14).toISOString(),
        relevanceScore: 0.61
      }
    ];

    return mockResults.slice(0, numResults);
  }
}

// ============================================================================
// Types
// ============================================================================

interface WebSearchParams {
  query: string;
  numResults?: number;
  searchDepth?: 'basic' | 'advanced';
}

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedDate: string;
  relevanceScore: number;
}

/**
 * Subset of the DuckDuckGo Instant Answer API response that we use.
 */
interface DuckDuckGoResponse {
  Abstract?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  Heading?: string;
  Infobox?: {
    content: Array<{
      label: string;
      value: string;
      wiki_order?: number;
    }>;
  };
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
  } | string>;
}
