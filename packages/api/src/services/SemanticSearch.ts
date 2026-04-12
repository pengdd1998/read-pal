/**
 * Semantic Search Service
 *
 * Integrates with Pinecone for vector similarity search across the user's
 * reading library. Provides document indexing, chunking, semantic search,
 * and similarity matching using text-based embeddings.
 */

import { getPinecone } from '../db';
import { Pinecone, type RecordMetadata } from '@pinecone-database/pinecone';
import type { Logger } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata stored alongside each vector in Pinecone.
 * Pinecone metadata values must be string, boolean, number, or string[].
 * Optional fields use empty-string defaults instead of undefined.
 */
interface ChunkMetadata {
  userId: string;
  bookId: string;
  documentId: string;
  chapterId: string;
  chapterTitle: string;
  chunkIndex: number;
  text: string;
  startIndex: number;
  endIndex: number;
  indexedAt: string;
}

/**
 * Options for the main search method.
 */
interface SearchOptions {
  /** Filter to a specific book. */
  bookId?: string;
  /** Filter to a specific chapter. */
  chapterId?: string;
  /** Only return results indexed after this ISO date. */
  startDate?: string;
  /** Only return results indexed before this ISO date. */
  endDate?: string;
  /** Maximum number of results (default 10, max 100). */
  topK?: number;
  /** Minimum similarity score threshold (0-1). */
  minScore?: number;
  /** Whether to include the full text in results (default true). */
  includeText?: boolean;
}

/**
 * A single search result.
 */
interface SearchResult {
  id: string;
  score: number;
  bookId: string;
  documentId: string;
  chapterId?: string;
  chapterTitle?: string;
  chunkIndex: number;
  text: string;
  metadata: Record<string, unknown>;
}

/**
 * A text chunk ready for indexing.
 */
interface TextChunk {
  id: string;
  content: string;
  chapterId?: string;
  chapterTitle?: string;
  startIndex: number;
  endIndex: number;
  order: number;
}

/**
 * Statistics about indexed content for a user.
 */
interface IndexStats {
  totalChunks: number;
  totalBooks: number;
  bookStats: Array<{
    bookId: string;
    chunkCount: number;
    lastIndexDate: string;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

/** Default Pinecone index name for read-pal. */
const DEFAULT_INDEX_NAME = 'readpal-semantic';

/** Maximum text length per chunk in characters. */
const MAX_CHUNK_SIZE = 1000;

/** Overlap between adjacent chunks in characters to preserve context. */
const CHUNK_OVERLAP = 200;

/** Default number of search results. */
const DEFAULT_TOP_K = 10;

/** Pinecone namespace separator to build user-scoped namespaces. */
const NAMESPACE_SEPARATOR = '::';

// ============================================================================
// Service
// ============================================================================

/**
 * SemanticSearch provides vector similarity search across a user's reading
 * library backed by Pinecone. It handles document chunking, embedding
 * generation, indexing, querying, and deletion.
 *
 * Embedding strategy: Since Anthropic does not expose a dedicated embeddings
 * API, we generate deterministic lightweight embeddings by hashing text
 * segments into a fixed-length vector. This is sufficient for prototype
 * development and can be swapped for a real embedding model (e.g. OpenAI
 * embeddings, Voyage AI, or a local model) when available.
 */
export class SemanticSearch {
  private readonly indexName: string;
  private readonly logger: Logger;

  /** Whether we have already logged the hash-fallback warning. */
  private _hashFallbackWarned = false;

  /**
   * @param indexName - Pinecone index name. Defaults to 'readpal-semantic'.
   * @param logger    - Logger implementation for diagnostics.
   */
  constructor(indexName: string = DEFAULT_INDEX_NAME, logger?: Logger) {
    this.indexName = indexName;
    this.logger = logger ?? console;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Index a single document/chunk for search.
   *
   * @returns The Pinecone record id of the indexed document.
   */
  async indexDocument(
    userId: string,
    bookId: string,
    documentId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    this.validateUserId(userId);

    if (!content || content.trim().length === 0) {
      throw new Error('Content cannot be empty');
    }

    const vector = await this.generateEmbedding(content);
    const namespace = this.buildNamespace(userId);
    const id = `${userId}-${bookId}-${documentId}`;

    const record = {
      id,
      values: vector,
      metadata: {
        userId,
        bookId,
        documentId,
        text: content,
        startIndex: 0,
        endIndex: content.length,
        chunkIndex: 0,
        indexedAt: new Date().toISOString(),
        ...(metadata as Record<string, string | number | boolean | string[]>),
      },
    };

    await this.withIndex(async (index) => {
      await index.namespace(namespace).upsert([record]);
    });

    this.logger.info('Indexed document', { userId, bookId, documentId });
    return id;
  }

  /**
   * Batch-index multiple text chunks from a book. Long chunks are
   * automatically split at paragraph boundaries.
   *
   * @returns Array of Pinecone record ids.
   */
  async indexChunks(
    userId: string,
    bookId: string,
    chunks: TextChunk[],
  ): Promise<string[]> {
    this.validateUserId(userId);

    if (!chunks || chunks.length === 0) {
      throw new Error('Chunks array cannot be empty');
    }

    const namespace = this.buildNamespace(userId);
    const ids: string[] = [];

    // Expand any oversized chunks and flatten into final batch.
    const allChunks = this.expandChunks(chunks);

    // Pinecone recommends batching upserts in groups of 100.
    const BATCH_SIZE = 100;

    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batch = allChunks.slice(i, i + BATCH_SIZE);

      const vectors = await Promise.all(
        batch.map(async (chunk) => {
          const vector = await this.generateEmbedding(chunk.content);
          const id = `${userId}-${bookId}-${chunk.id}`;
          ids.push(id);

          return {
            id,
            values: vector,
            metadata: {
              userId,
              bookId,
              documentId: chunk.id,
              chapterId: chunk.chapterId ?? '',
              chapterTitle: chunk.chapterTitle ?? '',
              chunkIndex: chunk.order,
              text: chunk.content,
              startIndex: chunk.startIndex,
              endIndex: chunk.endIndex,
              indexedAt: new Date().toISOString(),
            },
          };
        }),
      );

      await this.withIndex(async (index) => {
        await index.namespace(namespace).upsert(vectors);
      });
    }

    this.logger.info('Indexed chunks', {
      userId,
      bookId,
      totalIds: ids.length,
    });

    return ids;
  }

  /**
   * Semantic search across the user's entire library.
   */
  async search(
    userId: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    this.validateUserId(userId);

    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    const topK = Math.min(options?.topK ?? DEFAULT_TOP_K, 100);
    const minScore = options?.minScore ?? 0;
    const includeText = options?.includeText ?? true;
    const namespace = this.buildNamespace(userId);

    const queryVector = await this.generateEmbedding(query);
    const filter = this.buildFilter(options);

    const response = await this.withIndex(async (index) => {
      return index.namespace(namespace).query({
        vector: queryVector,
        topK,
        includeMetadata: true,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });
    });

    const results = (response?.matches ?? [])
      .filter((match) => (match.score ?? 0) >= minScore)
      .map((match) => this.toSearchResult(match, includeText));

    this.logger.info('Semantic search completed', {
      userId,
      queryLength: query.length,
      resultCount: results.length,
    });

    return results;
  }

  /**
   * Search within a specific book only.
   */
  async searchInBook(
    userId: string,
    bookId: string,
    query: string,
    topK: number = DEFAULT_TOP_K,
  ): Promise<SearchResult[]> {
    return this.search(userId, query, { bookId, topK });
  }

  /**
   * Find passages similar to a specific indexed document.
   */
  async findSimilar(
    userId: string,
    documentId: string,
    topK: number = DEFAULT_TOP_K,
  ): Promise<SearchResult[]> {
    this.validateUserId(userId);

    const namespace = this.buildNamespace(userId);

    const response = await this.withIndex(async (index) => {
      return index.namespace(namespace).query({
        id: documentId,
        topK: topK + 1, // +1 because the document itself will match
        includeMetadata: true,
      });
    });

    const results = (response?.matches ?? [])
      .filter((match) => match.id !== documentId)
      .slice(0, topK)
      .map((match) => this.toSearchResult(match, true));

    this.logger.info('Find similar completed', {
      userId,
      documentId,
      resultCount: results.length,
    });

    return results;
  }

  /**
   * Remove all indexed content for a book from Pinecone.
   */
  async deleteBook(userId: string, bookId: string): Promise<void> {
    this.validateUserId(userId);

    const namespace = this.buildNamespace(userId);

    await this.withIndex(async (index) => {
      await index.namespace(namespace).deleteMany({
        bookId: { $eq: bookId },
      });
    });

    this.logger.info('Deleted book from index', { userId, bookId });
  }

  /**
   * Get indexing statistics for a user.
   */
  async getStats(userId: string): Promise<IndexStats> {
    this.validateUserId(userId);

    const namespace = this.buildNamespace(userId);

    const description = await this.withIndex(async (index) => {
      return index.describeIndexStats();
    });

    const namespaceStats =
      (description?.namespaces?.[namespace] as { recordCount?: number } | undefined) ?? undefined;
    const totalChunks = namespaceStats?.recordCount ?? 0;

    // Run a broad query to discover which books exist for this user.
    // Use a zero-vector query with filter to list metadata. This is a
    // lightweight approach; in production, book-level counts could be
    // maintained in PostgreSQL instead.
    const bookSet = new Set<string>();
    let bookStats: IndexStats['bookStats'] = [];

    if (totalChunks > 0) {
      try {
        const sampleResponse = await this.withIndex(async (index) => {
          return index.namespace(namespace).query({
            vector: new Array(256).fill(0),
            topK: 100,
            includeMetadata: true,
            filter: { userId: { $eq: userId } },
          });
        });

        const bookMap = new Map<string, { count: number; lastIndexDate: string }>();

        for (const match of sampleResponse?.matches ?? []) {
          const meta = match.metadata as ChunkMetadata | undefined;
          if (!meta) continue;

          const bId = meta.bookId;
          if (!bookMap.has(bId)) {
            bookMap.set(bId, { count: 0, lastIndexDate: meta.indexedAt });
          }
          const entry = bookMap.get(bId)!;
          entry.count += 1;
          if (meta.indexedAt > entry.lastIndexDate) {
            entry.lastIndexDate = meta.indexedAt;
          }
          bookSet.add(bId);
        }

        bookStats = Array.from(bookMap.entries()).map(([bookId, stats]) => ({
          bookId,
          chunkCount: stats.count,
          lastIndexDate: stats.lastIndexDate,
        }));
      } catch (error) {
        this.logger.warn('Failed to gather per-book stats', { error });
      }
    }

    return {
      totalChunks,
      totalBooks: bookSet.size,
      bookStats,
    };
  }

  // --------------------------------------------------------------------------
  // Chunking
  // --------------------------------------------------------------------------

  /**
   * Split text into chunks at paragraph boundaries, respecting the maximum
   * chunk size and overlap settings.
   */
  static chunkText(
    text: string,
    options?: { maxChunkSize?: number; overlap?: number },
  ): TextChunk[] {
    const maxSize = options?.maxChunkSize ?? MAX_CHUNK_SIZE;
    const overlap = options?.overlap ?? CHUNK_OVERLAP;

    if (!text || text.trim().length === 0) {
      return [];
    }

    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    const chunks: TextChunk[] = [];
    let currentContent = '';
    let chunkStartIndex = 0;
    let globalPosition = 0;
    let chunkOrder = 0;

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();

      // If adding this paragraph exceeds the limit, flush the current chunk.
      if (currentContent.length + trimmed.length > maxSize && currentContent.length > 0) {
        chunks.push({
          id: `chunk-${chunkOrder}`,
          content: currentContent.trim(),
          startIndex: chunkStartIndex,
          endIndex: chunkStartIndex + currentContent.trim().length,
          order: chunkOrder,
        });

        // Apply overlap: carry the tail of the current chunk forward.
        const overlapText = currentContent.slice(-overlap);
        chunkStartIndex += currentContent.trim().length - overlapText.length;
        currentContent = overlapText;
        chunkOrder++;
      }

      if (currentContent.length > 0) {
        currentContent += '\n\n';
      } else {
        chunkStartIndex = globalPosition;
      }

      currentContent += trimmed;
      globalPosition += trimmed.length + 2; // +2 for paragraph separator
    }

    // Flush remaining content.
    if (currentContent.trim().length > 0) {
      chunks.push({
        id: `chunk-${chunkOrder}`,
        content: currentContent.trim(),
        startIndex: chunkStartIndex,
        endIndex: chunkStartIndex + currentContent.trim().length,
        order: chunkOrder,
      });
    }

    return chunks;
  }

  // --------------------------------------------------------------------------
  // Embedding Generation
  // --------------------------------------------------------------------------

  /**
   * Generate an embedding vector from text.
   *
   * Strategy:
   *  1. If OPENAI_API_KEY is set, call OpenAI's text-embedding-3-small model
   *     (1536-dimensional vectors) for real semantic embeddings.
   *  2. Otherwise fall back to a deterministic hash-based pseudo-vector with
   *     a warning log.  The hash approach allows the pipeline to function
   *     end-to-end during development but does NOT produce meaningful
   *     similarity results.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // --- Attempt real embedding via GLM (primary) ---
    if (process.env.GLM_API_KEY) {
      try {
        return await this.generateGLMEmbedding(text);
      } catch (error) {
        this.logger.warn('GLM embedding generation failed, trying OpenAI fallback', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // --- Attempt real embedding via OpenAI (secondary) ---
    if (process.env.OPENAI_API_KEY) {
      try {
        return await this.generateOpenAIEmbedding(text);
      } catch (error) {
        this.logger.warn('OpenAI embedding generation failed, falling back to hash-based', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // --- Fallback: hash-based pseudo-vector ---
    if (!this._hashFallbackWarned) {
      this.logger.warn(
        'Neither GLM_API_KEY nor OPENAI_API_KEY is set – using hash-based pseudo-embeddings. ' +
        'Set GLM_API_KEY for real semantic search.',
      );
      this._hashFallbackWarned = true;
    }

    return this.generateHashEmbedding(text);
  }

  /**
   * Call GLM (Zhipu AI) embedding API to produce a real semantic vector.
   * Uses embedding-3 model via the OpenAI-compatible endpoint.
   */
  private async generateGLMEmbedding(text: string): Promise<number[]> {
    const baseUrl = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'embedding-3',
        input: text.slice(0, 8192),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `GLM embedding API returned ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = await response.json() as OpenAIEmbeddingResponse;

    if (!data.data?.[0]?.embedding) {
      throw new Error('GLM embedding response missing expected data');
    }

    return data.data[0].embedding;
  }

  /**
   * Call OpenAI's embedding API to produce a real semantic vector.
   */
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8192), // Token limit safety – trim to ~8k chars
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `OpenAI embedding API returned ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = await response.json() as OpenAIEmbeddingResponse;

    if (!data.data?.[0]?.embedding) {
      throw new Error('OpenAI embedding response missing expected data');
    }

    return data.data[0].embedding;
  }

  /**
   * Generate a deterministic hash-based pseudo-vector from text.
   *
   * This is the original fallback approach: splits text into segments, hashes
   * each segment, and builds a fixed-size vector. It produces consistent
   * vectors but with no meaningful semantic similarity.
   */
  private generateHashEmbedding(text: string): number[] {
    const DIMENSION = 256;
    const normalized = text.toLowerCase().trim();
    const vector = new Float32Array(DIMENSION);

    // Split text into n-gram-like segments.
    const segments = this.segmentText(normalized);

    for (let i = 0; i < segments.length; i++) {
      const hash = this.hashString(segments[i]);
      const position = Math.abs(hash) % DIMENSION;

      // Spread the hash influence across a few adjacent dimensions.
      for (let offset = -2; offset <= 2; offset++) {
        const idx = (position + offset + DIMENSION) % DIMENSION;
        const contribution = (hash * (i + 1)) / (Math.abs(offset) + 1);
        vector[idx] += contribution;
      }
    }

    // Normalize to unit length.
    let magnitude = 0;
    for (let i = 0; i < DIMENSION; i++) {
      magnitude += vector[i] * vector[i];
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude > 0) {
      for (let i = 0; i < DIMENSION; i++) {
        vector[i] /= magnitude;
      }
    }

    return Array.from(vector);
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Execute a callback with the Pinecone index client. Throws a clear error
   * when Pinecone is not configured.
   */
  private async withIndex<T>(
    callback: (index: ReturnType<Pinecone['index']>) => Promise<T>,
  ): Promise<T> {
    const client = getPinecone();

    if (!client) {
      throw new Error(
        'Pinecone is not configured. Set the PINECONE_API_KEY environment variable.',
      );
    }

    const index = client.index(this.indexName);
    return callback(index);
  }

  /**
   * Build a user-scoped Pinecone namespace string.
   */
  private buildNamespace(userId: string): string {
    return `user${NAMESPACE_SEPARATOR}${userId}`;
  }

  /**
   * Build a Pinecone metadata filter from search options.
   */
  private buildFilter(options?: SearchOptions): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (options?.bookId) {
      filter.bookId = { $eq: options.bookId };
    }

    if (options?.chapterId) {
      filter.chapterId = { $eq: options.chapterId };
    }

    if (options?.startDate || options?.endDate) {
      const dateFilter: Record<string, string> = {};
      if (options.startDate) {
        dateFilter.$gte = options.startDate;
      }
      if (options.endDate) {
        dateFilter.$lte = options.endDate;
      }
      filter.indexedAt = dateFilter;
    }

    return filter;
  }

  /**
   * Convert a Pinecone scored record into a SearchResult.
   */
  private toSearchResult(
    match: { id: string; score?: number; metadata?: Record<string, unknown> },
    includeText: boolean,
  ): SearchResult {
    const meta = match.metadata ?? {};
    const chapterId = meta.chapterId as string | undefined;
    const chapterTitle = meta.chapterTitle as string | undefined;
    return {
      id: match.id,
      score: match.score ?? 0,
      bookId: (meta.bookId as string) ?? '',
      documentId: (meta.documentId as string) ?? '',
      chapterId: chapterId && chapterId.length > 0 ? chapterId : undefined,
      chapterTitle: chapterTitle && chapterTitle.length > 0 ? chapterTitle : undefined,
      chunkIndex: (meta.chunkIndex as number) ?? 0,
      text: includeText ? ((meta.text as string) ?? '') : '',
      metadata: meta,
    };
  }

  /**
   * Validate that a user id is present and non-empty.
   */
  private validateUserId(userId: string): void {
    if (!userId || userId.trim().length === 0) {
      throw new Error('userId is required');
    }
  }

  /**
   * Expand chunks whose content exceeds the maximum size into smaller
   * sub-chunks using the static chunkText method.
   */
  private expandChunks(chunks: TextChunk[]): TextChunk[] {
    const expanded: TextChunk[] = [];

    for (const chunk of chunks) {
      if (chunk.content.length <= MAX_CHUNK_SIZE) {
        expanded.push(chunk);
        continue;
      }

      const subChunks = SemanticSearch.chunkText(chunk.content);
      for (const sub of subChunks) {
        expanded.push({
          ...sub,
          id: `${chunk.id}-${sub.id}`,
          chapterId: chunk.chapterId,
          chapterTitle: chunk.chapterTitle,
          startIndex: chunk.startIndex + sub.startIndex,
          endIndex: chunk.startIndex + sub.endIndex,
        });
      }
    }

    return expanded;
  }

  /**
   * Split text into overlapping character segments for hashing.
   */
  private segmentText(text: string): string[] {
    const SEGMENT_LENGTH = 8;
    const SEGMENT_STEP = 4;
    const segments: string[] = [];

    for (let i = 0; i <= text.length - SEGMENT_LENGTH; i += SEGMENT_STEP) {
      segments.push(text.slice(i, i + SEGMENT_LENGTH));
    }

    // Ensure at least one segment for very short text.
    if (segments.length === 0 && text.length > 0) {
      segments.push(text);
    }

    return segments;
  }

  /**
   * Simple polynomial string hash. Deterministic and fast.
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      // Use prime multiplier 31 (standard Java String.hashCode approach).
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return hash;
  }
}

// ============================================================================
// External API Types
// ============================================================================

/**
 * Minimal shape of the OpenAI /v1/embeddings response we consume.
 */
interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
