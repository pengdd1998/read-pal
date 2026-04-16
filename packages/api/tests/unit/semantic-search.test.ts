/**
 * SemanticSearch Unit Tests
 *
 * Tests the static chunkText method and private helpers that can be exercised
 * without Pinecone. The embedding / indexing paths require external services
 * and are covered by integration tests instead.
 */

import { SemanticSearch } from '../../src/services/SemanticSearch';

describe('SemanticSearch', () => {
  // ---------------------------------------------------------------------------
  // chunkText (static)
  // ---------------------------------------------------------------------------
  describe('chunkText', () => {
    it('should return empty array for empty string', () => {
      expect(SemanticSearch.chunkText('')).toEqual([]);
    });

    it('should return empty array for whitespace-only string', () => {
      expect(SemanticSearch.chunkText('   \n\n  \t  ')).toEqual([]);
    });

    it('should return a single chunk for short text', () => {
      const text = 'Hello world. This is a short paragraph.';
      const chunks = SemanticSearch.chunkText(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(text);
      expect(chunks[0].order).toBe(0);
      expect(chunks[0].startIndex).toBe(0);
    });

    it('should split text at paragraph boundaries', () => {
      const paragraph = 'a'.repeat(400);
      const text = Array(5).fill(paragraph).join('\n\n');
      // 5 paragraphs of 400 chars = 2000 chars total, default maxChunkSize 1000
      const chunks = SemanticSearch.chunkText(text);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // Every chunk should have content
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.id).toMatch(/^chunk-\d+$/);
      }
    });

    it('should respect custom maxChunkSize', () => {
      const paragraph = 'a'.repeat(200);
      const text = Array(4).fill(paragraph).join('\n\n'); // 800 chars total
      const chunks = SemanticSearch.chunkText(text, { maxChunkSize: 300 });
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        // Chunk may exceed maxChunkSize slightly due to overlap carryover
        expect(chunk.content.length).toBeLessThanOrEqual(500);
      }
    });

    it('should apply overlap between chunks', () => {
      const paragraph = 'x'.repeat(600);
      const text = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
      const chunks = SemanticSearch.chunkText(text, {
        maxChunkSize: 1000,
        overlap: 100,
      });
      if (chunks.length >= 2) {
        // The second chunk should start with overlap from the first
        const firstChunk = chunks[0].content;
        const overlapText = firstChunk.slice(-100);
        expect(chunks[1].content.startsWith(overlapText)).toBe(true);
      }
    });

    it('should assign sequential order values', () => {
      const paragraph = 'b'.repeat(500);
      const text = Array(5).fill(paragraph).join('\n\n');
      const chunks = SemanticSearch.chunkText(text, { maxChunkSize: 800 });
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].order).toBe(i);
      }
    });

    it('should handle text with single paragraph (no double newlines)', () => {
      const text = 'Just a single paragraph without any breaks.';
      const chunks = SemanticSearch.chunkText(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(text);
    });

    it('should skip empty paragraphs', () => {
      const text = 'para1\n\n\n\npara2';
      const chunks = SemanticSearch.chunkText(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toContain('para1');
      expect(chunks[0].content).toContain('para2');
    });

    it('should handle very large overlap exceeding content', () => {
      const text = 'Short text.';
      const chunks = SemanticSearch.chunkText(text, { overlap: 1000, maxChunkSize: 500 });
      expect(chunks).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Constructor & validateUserId
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('should accept custom index name', () => {
      const search = new SemanticSearch('custom-index');
      expect(search).toBeInstanceOf(SemanticSearch);
    });

    it('should accept custom logger', () => {
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      const search = new SemanticSearch('idx', logger);
      expect(search).toBeInstanceOf(SemanticSearch);
    });

    it('should use defaults when no arguments given', () => {
      const search = new SemanticSearch();
      expect(search).toBeInstanceOf(SemanticSearch);
    });
  });

  // ---------------------------------------------------------------------------
  // generateEmbedding (hash fallback only — no external API keys in tests)
  // ---------------------------------------------------------------------------
  describe('generateEmbedding', () => {
    it('should produce a 256-dimension vector via hash fallback', async () => {
      // Ensure no API keys are set so we hit the hash fallback
      const origGLM = process.env.GLM_API_KEY;
      const origOpenAI = process.env.OPENAI_API_KEY;
      delete process.env.GLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      const search = new SemanticSearch('test', logger);
      const vector = await search.generateEmbedding('hello world');

      expect(vector).toHaveLength(256);
      // Should be normalized (unit vector)
      const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeCloseTo(1.0, 4);

      // Restore
      if (origGLM) process.env.GLM_API_KEY = origGLM;
      if (origOpenAI) process.env.OPENAI_API_KEY = origOpenAI;
    });

    it('should produce deterministic vectors for same input', async () => {
      const origGLM = process.env.GLM_API_KEY;
      const origOpenAI = process.env.OPENAI_API_KEY;
      delete process.env.GLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      const search = new SemanticSearch('test', logger);
      const v1 = await search.generateEmbedding('test input');
      const v2 = await search.generateEmbedding('test input');
      expect(v1).toEqual(v2);

      if (origGLM) process.env.GLM_API_KEY = origGLM;
      if (origOpenAI) process.env.OPENAI_API_KEY = origOpenAI;
    });

    it('should produce different vectors for different inputs', async () => {
      const origGLM = process.env.GLM_API_KEY;
      const origOpenAI = process.env.OPENAI_API_KEY;
      delete process.env.GLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      const search = new SemanticSearch('test', logger);
      const v1 = await search.generateEmbedding('text one');
      const v2 = await search.generateEmbedding('completely different text');
      expect(v1).not.toEqual(v2);

      if (origGLM) process.env.GLM_API_KEY = origGLM;
      if (origOpenAI) process.env.OPENAI_API_KEY = origOpenAI;
    });
  });

  // ---------------------------------------------------------------------------
  // Input validation
  // ---------------------------------------------------------------------------

  describe('indexChunks', () => {
    it('should throw on empty chunks array', async () => {
      const search = new SemanticSearch('test');
      await expect(search.indexChunks('user-1', 'book-1', []))
        .rejects.toThrow('Chunks array cannot be empty');
    });

    it('should throw on empty userId', async () => {
      const search = new SemanticSearch('test');
      await expect(search.indexChunks('', 'book-1', [{ id: 'c1', content: 'text', startIndex: 0, endIndex: 4, order: 0 }]))
        .rejects.toThrow('userId is required');
    });
  });

  describe('search', () => {
    it('should throw on empty query', async () => {
      const search = new SemanticSearch('test');
      await expect(search.search('user-1', ''))
        .rejects.toThrow('Query cannot be empty');
    });

    it('should throw on whitespace-only query', async () => {
      const search = new SemanticSearch('test');
      await expect(search.search('user-1', '   '))
        .rejects.toThrow('Query cannot be empty');
    });

    it('should throw on empty userId', async () => {
      const search = new SemanticSearch('test');
      await expect(search.search('', 'query'))
        .rejects.toThrow('userId is required');
    });
  });

});
