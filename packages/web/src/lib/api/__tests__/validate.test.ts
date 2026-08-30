import { describe, expect, it, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { z } from 'zod';

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
}));

vi.mock('axios', () => ({
  __esModule: true,
  default: {
    create: vi.fn(() => ({
      request: mockRequest,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      post: vi.fn(),
    })),
    isAxiosError: vi.fn(() => false),
    isCancel: vi.fn(() => false),
  },
}));

vi.mock('../../offline-queue', () => ({
  queueMutation: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../auth-fetch', () => ({
  getAuthToken: () => null,
}));

import { api } from '../client';
import { API_CONTRACT_MISMATCH } from '../validate';
import {
  bookListResponseSchema,
  chatHistoryResponseSchema,
} from '../schemas';

const bookSchema = z.array(z.object({ id: z.string(), title: z.string() }));

/** Minimal-but-real book-list payloads as the backend ships them. */
const validBooks = [{
  id: 'b1', userId: 'u1', title: 'Roadside Picnic', author: 'Strugatsky',
  coverUrl: null, fileType: 'epub', fileSize: 1024, totalPages: 200,
  currentPage: 10, progress: 0.05, status: 'reading', tags: ['sci-fi'],
  addedAt: '2026-08-30T00:00:00Z',
}];

describe('API boundary schema validation', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    api.invalidateCache();
  });

  it('passes matching payloads through untouched', async () => {
    mockRequest.mockResolvedValue({ data: { success: true, data: [{ id: '1', title: 'B' }] } });

    const result = await api.get('/api/test-valid', undefined, undefined, bookSchema);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ id: '1', title: 'B' }]);
  });

  it('degrades a shape-mismatched payload to a contract error', async () => {
    mockRequest.mockResolvedValue({ data: { success: true, data: [{ id: '1' }] } }); // title missing

    const result = await api.get('/api/test-drift', undefined, undefined, bookSchema);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(API_CONTRACT_MISMATCH);
    // The offending path must be in the error details for diagnosability.
    expect(JSON.stringify(result.error?.details)).toContain('title');
  });

  it('does not cache a shape-mismatched payload', async () => {
    // /api/books has TTL 30s — a cached bad payload would pin the drift.
    mockRequest.mockResolvedValue({ data: { success: true, data: [{ title: 'no id' }] } });

    await api.get('/api/books', undefined, undefined, bookSchema);
    const second = await api.get('/api/books', undefined, undefined, bookSchema);

    // Second call hit the network again (2 requests, not 1) — the bad
    // shape was not served from cache.
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(second.error?.code).toBe(API_CONTRACT_MISMATCH);
  });

  it('caches a matching payload normally', async () => {
    mockRequest.mockResolvedValue({ data: { success: true, data: validBooks } });

    await api.get('/api/books', undefined, undefined, bookListResponseSchema);
    const second = await api.get('/api/books', undefined, undefined, bookListResponseSchema);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(second.success).toBe(true);
    expect(second.data?.[0]?.title).toBe('Roadside Picnic');
  });

  it('keeps error envelopes untouched (no schema applies to failures)', async () => {
    mockRequest.mockResolvedValue({
      data: { success: false, error: { code: 'SOME_ERROR', message: 'x' } },
    });

    const result = await api.get('/api/test-err', undefined, undefined, bookSchema);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SOME_ERROR');
  });

  it('accepts both chat-history shapes (flat list and cursor page)', () => {
    const flat = [{ id: '1', role: 'user', content: 'hi', createdAt: '2026-08-30T00:00:00Z' }];
    const page = { items: flat, nextCursor: null };

    expect(chatHistoryResponseSchema.safeParse(flat).success).toBe(true);
    expect(chatHistoryResponseSchema.safeParse(page).success).toBe(true);
  });

  it('accepts the real backend book-list shape (progress as string)', () => {
    // Fixture captured from a live /api/books response — guards against
    // schema drift from idealized test data (progress arrives as "40.00").
    const real = [{
      id: '3a049b72-9b74-46d5-b202-34dad2861c8b',
      userId: '19f4cd19-3fdb-46a2-8e1d-44e9c8d255a9',
      title: 'The Great Gatsby',
      author: 'F. Scott Fitzgerald',
      coverUrl: null,
      fileType: 'epub',
      fileSize: 2048,
      totalPages: 5,
      currentPage: 2,
      currentSegment: 0,
      progress: '40.00',
      status: 'reading',
      tags: ['sample', 'classic', 'fiction'],
      addedAt: '2026-08-30T11:46:43.927653',
      startedAt: null,
      completedAt: null,
      lastReadAt: '2026-08-30T14:22:05.489708',
      createdAt: '2026-08-30T11:46:43.927657',
      updatedAt: '2026-08-30T14:22:06.017763',
    }];
    const res = bookListResponseSchema.safeParse(real);
    expect(res.success).toBe(true);
    expect(res.success && res.data[0].progress).toBe(40);
  });

  it('rejects chat-history payloads with a broken role enum', () => {
    const bad = [{ id: '1', role: 'system', content: 'hi' }];
    expect(chatHistoryResponseSchema.safeParse(bad).success).toBe(false);
  });
});
