// ============================================================================
// Library Search Tool
// ============================================================================

import type {
  ToolCategory,
  ToolContext,
  ToolResult,
  Match,
  BookMetadata,
  Document,
} from '../../types';
import { BaseTool } from './BaseTool';
import { SemanticSearch } from '../../services/SemanticSearch';

/**
 * Library Search Tool
 *
 * Performs semantic search across a user's reading library
 * to find relevant documents, passages, and concepts.
 */
export class LibrarySearchTool extends BaseTool {
  readonly name = 'library_search';
  private semanticSearch: SemanticSearch;

  constructor() {
    super();
    this.semanticSearch = new SemanticSearch();
  }
  readonly description = 'Search across the user\'s reading library using semantic search to find relevant documents, passages, and concepts.';
  readonly category = 'database' as ToolCategory;
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The search query - can be a question, topic, or concept to search for'
      },
      userId: {
        type: 'string',
        description: 'The user ID to search in their library'
      },
      filters: {
        type: 'object',
        description: 'Optional filters to narrow the search',
        properties: {
          documentType: {
            type: 'string',
            description: 'Filter by document type (ebook, pdf, etc.)',
            enum: ['ebook', 'pdf', 'audiobook', 'webpage']
          },
          dateRange: {
            type: 'object',
            description: 'Filter by date range',
            properties: {
              start: { type: 'string', description: 'Start date (ISO 8601)' },
              end: { type: 'string', description: 'End date (ISO 8601)' }
            }
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by tags'
          }
        }
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10, max: 50)'
      }
    },
    required: ['query', 'userId']
  };

  /**
   * Execute the library search
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

    const params = input as LibrarySearchParams;
    const limit = Math.min(params.limit || 10, 50);

    context.logger.info('Library search', {
      userId: params.userId,
      query: params.query,
      limit
    });

    try {
      // --- Strategy 1: Semantic search via Pinecone ---
      let userMatches: LibrarySearchResult[];

      try {
        const queryEmbedding = await this.generateEmbedding(params.query);
        const matches = await context.db.pinecone.query(
          'readpal-library',
          queryEmbedding,
          limit
        );

        // Filter by user ID and apply additional filters
        userMatches = await this.filterAndEnhanceMatches(
          matches,
          params.userId,
          context,
          params.filters
        );
      } catch (pineconeError) {
        // Pinecone unavailable or embedding failed – fall back to keyword search
        context.logger.warn('Pinecone search unavailable, falling back to keyword search', {
          error: pineconeError instanceof Error ? pineconeError.message : String(pineconeError),
        });

        userMatches = await this.keywordSearch(
          params.query,
          params.userId,
          context,
          limit,
          params.filters
        );
      }

      // If semantic search returned nothing, supplement with keyword results
      if (userMatches.length === 0) {
        const keywordResults = await this.keywordSearch(
          params.query,
          params.userId,
          context,
          limit,
          params.filters
        );

        // Merge, avoiding duplicates by document id
        const existingIds = new Set(userMatches.map((r) => r.document.id));
        for (const kr of keywordResults) {
          if (!existingIds.has(kr.document.id)) {
            userMatches.push(kr);
          }
        }
      }

      context.logger.info('Library search completed', {
        userId: params.userId,
        query: params.query,
        results: userMatches.length
      });

      return {
        success: true,
        data: {
          results: userMatches,
          total: userMatches.length,
          query: params.query
        }
      };

    } catch (error) {
      context.logger.error('Library search failed', {
        userId: params.userId,
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
   * Generate embedding via SemanticSearch (OpenAI text-embedding-3-small
   * with hash-based fallback when API key is unavailable).
   */
  private async generateEmbedding(query: string): Promise<number[]> {
    return this.semanticSearch.generateEmbedding(query);
  }

  /**
   * Perform a keyword-based text search against the PostgreSQL database.
   *
   * Uses PostgreSQL full-text search operators (`plainto_tsquery` / `tsvectors`)
   * when available, with a plain ILIKE fallback for simple setups.  This is used
   * as a fallback when Pinecone is unavailable or when the embedding model is
   * not configured.
   */
  private async keywordSearch(
    query: string,
    userId: string,
    context: ToolContext,
    limit: number,
    filters?: LibrarySearchFilters,
  ): Promise<LibrarySearchResult[]> {
    const conditions: string[] = ['"userId" = $1'];
    const params: unknown[] = [userId];
    let paramIdx = 2;

    // Full-text search against title and content
    const tsQuery = query
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `${w}:*`)
      .join(' & ');

    conditions.push(
      `(to_tsvector('english', coalesce(title, '')) @@ to_tsquery($${paramIdx}) OR ` +
      `to_tsvector('english', coalesce(content, '')) @@ to_tsquery($${paramIdx}) OR ` +
      `title ILIKE $${paramIdx + 1})`,
    );
    params.push(tsQuery, `%${query}%`);
    paramIdx += 2;

    // Apply optional filters
    if (filters?.documentType) {
      conditions.push(`type = $${paramIdx}`);
      params.push(filters.documentType);
      paramIdx++;
    }

    if (filters?.dateRange?.start) {
      conditions.push(`"createdAt" >= $${paramIdx}`);
      params.push(filters.dateRange.start);
      paramIdx++;
    }

    if (filters?.dateRange?.end) {
      conditions.push(`"createdAt" <= $${paramIdx}`);
      params.push(filters.dateRange.end);
      paramIdx++;
    }

    if (filters?.tags && filters.tags.length > 0) {
      conditions.push(`metadata->'tags' ?| $${paramIdx}`);
      params.push(filters.tags);
      paramIdx++;
    }

    params.push(limit);

    const sql = `
      SELECT id, title, author, type, metadata, "createdAt",
             ts_rank(
               to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')),
               to_tsquery($2)
             ) AS rank
      FROM documents
      WHERE ${conditions.join(' AND ')}
      ORDER BY rank DESC, "createdAt" DESC
      LIMIT $${paramIdx}
    `;

    try {
      const rows = await context.db.postgres.query<Document & { rank: number }>(sql, params);

      return rows.map((row, idx) => ({
        document: {
          id: row.id,
          title: row.title,
          author: row.author,
          type: row.type,
          metadata: row.metadata,
        },
        score: row.rank ?? (1 - idx * 0.05),
        relevance: Math.min((row.rank ?? 0.5) * 2, 1),
      }));
    } catch (error) {
      // If full-text search operators are unavailable (e.g. missing tsvector
      // column), fall back to a simple ILIKE query.
      context.logger.warn('Full-text search failed, falling back to ILIKE', {
        error: error instanceof Error ? error.message : String(error),
      });

      return this.keywordSearchIlike(query, userId, context, limit, filters);
    }
  }

  /**
   * Simple ILIKE-based keyword search fallback.
   */
  private async keywordSearchIlike(
    query: string,
    userId: string,
    context: ToolContext,
    limit: number,
    filters?: LibrarySearchFilters,
  ): Promise<LibrarySearchResult[]> {
    const conditions: string[] = ['"userId" = $1'];
    const params: unknown[] = [userId];
    let paramIdx = 2;

    conditions.push(`(title ILIKE $${paramIdx} OR content ILIKE $${paramIdx})`);
    params.push(`%${query}%`);
    paramIdx++;

    if (filters?.documentType) {
      conditions.push(`type = $${paramIdx}`);
      params.push(filters.documentType);
      paramIdx++;
    }

    params.push(limit);

    const sql = `
      SELECT id, title, author, type, metadata, "createdAt"
      FROM documents
      WHERE ${conditions.join(' AND ')}
      ORDER BY "createdAt" DESC
      LIMIT $${paramIdx}
    `;

    const rows = await context.db.postgres.query<Document>(sql, params);

    return rows.map((row, idx) => ({
      document: {
        id: row.id,
        title: row.title,
        author: row.author,
        type: row.type,
        metadata: row.metadata,
      },
      score: 1 - idx * 0.05,
      relevance: 1 - idx * 0.05,
    }));
  }

  /**
   * Filter matches by user and enhance with document metadata
   */
  private async filterAndEnhanceMatches(
    matches: Match[],
    userId: string,
    context: ToolContext,
    filters?: LibrarySearchFilters
  ): Promise<LibrarySearchResult[]> {
    // Get document IDs from matches
    const documentIds = matches.map(m => m.id);

    // Fetch documents from PostgreSQL
    const documents = await context.db.postgres.query<Document>(
      `SELECT id, title, author, type, metadata, "createdAt"
       FROM documents
       WHERE "userId" = $1 AND id = ANY($2)
       LIMIT $3`,
      [userId, documentIds, matches.length]
    );

    // Create a map for quick lookup
    const docMap = new Map(documents.map(d => [d.id, d]));

    // Filter and enhance results
    const results: LibrarySearchResult[] = [];

    for (const match of matches) {
      const document = docMap.get(match.id);
      if (!document) continue;

      // Apply filters
      if (filters?.documentType && document.type !== filters.documentType) {
        continue;
      }

      if (filters?.tags) {
        const docTags = (document.metadata as Record<string, unknown> | undefined)?.tags as string[] || [];
        if (!filters.tags.some(tag => docTags.includes(tag))) {
          continue;
        }
      }

      // Add to results
      results.push({
        document: {
          id: document.id,
          title: document.title,
          author: document.author,
          type: document.type,
          metadata: document.metadata
        },
        score: match.score,
        relevance: this.calculateRelevance(match.score, match.metadata)
      });
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);

    return results;
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(
    score: number,
    metadata?: Record<string, unknown>
  ): number {
    // Base relevance from semantic similarity
    let relevance = score;

    // Boost for recent documents
    if (metadata?.createdAt) {
      const age = Date.now() - new Date(metadata.createdAt as string).getTime();
      const ageInDays = age / (1000 * 60 * 60 * 24);
      if (ageInDays < 30) {
        relevance *= 1.1; // 10% boost for recent docs
      }
    }

    return Math.min(relevance, 1);
  }
}

// ============================================================================
// Types
// ============================================================================

interface LibrarySearchParams {
  query: string;
  userId: string;
  filters?: LibrarySearchFilters;
  limit?: number;
}

interface LibrarySearchFilters {
  documentType?: 'ebook' | 'pdf' | 'audiobook' | 'webpage';
  dateRange?: {
    start: string;
    end: string;
  };
  tags?: string[];
}

interface LibrarySearchResult {
  document: {
    id: string;
    title: string;
    author: string;
    type: string;
    metadata?: BookMetadata;
  };
  score: number;
  relevance: number;
}
