// ============================================================================
// Library Search Tool
// ============================================================================

/**
 * Library Search Tool
 *
 * Performs semantic search across a user's reading library
 * to find relevant documents, passages, and concepts.
 */
export class LibrarySearchTool extends BaseTool {
  readonly name = 'library_search';
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
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(params.query);

      // Search in Pinecone for similar documents
      const matches = await context.db.pinecone.query(
        'readpal-library',
        queryEmbedding,
        limit
      );

      // Filter by user ID and apply additional filters
      const userMatches = await this.filterAndEnhanceMatches(
        matches,
        params.userId,
        params.filters,
        context
      );

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
   * Generate embedding for search query
   */
  private async generateEmbedding(query: string): Promise<number[]> {
    // In production, this would use an embedding model
    // For now, return a simple hash-based embedding
    const words = query.toLowerCase().split(/\s+/);
    const embedding = new Array(1536).fill(0);

    // Simple word-based embedding (placeholder)
    words.forEach((word, i) => {
      const hash = this.simpleHash(word);
      embedding[i % embedding.length] = (hash % 1000) / 1000;
    });

    return embedding;
  }

  /**
   * Simple hash function for placeholder embeddings
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Filter matches by user and enhance with document metadata
   */
  private async filterAndEnhanceMatches(
    matches: Match[],
    userId: string,
    filters?: LibrarySearchFilters,
    context: ToolContext
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
        const docTags = document.metadata?.tags || [];
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
          type: document.type as any,
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
