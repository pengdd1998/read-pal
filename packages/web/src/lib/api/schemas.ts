/**
 * Zod schemas for the highest-risk API reads.
 *
 * Start small: chat history (the Round-189 silent-loss incident class) and
 * the books list (most-consumed read). Add schemas here as endpoints gain
 * UI surface — the rule of thumb is: if a missing field would crash a
 * render or silently blank a screen, that endpoint earns a schema.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Chat history — /api/agents/history
//
// Two shapes share this endpoint: the legacy flat list (no `before` param)
// and the cursor page (`before` param). The consumer normalizes both, so
// the schema is a union. Everything beyond role/content is optional because
// the consumer has per-field fallbacks (id → generateId, timestamps → now).
// ---------------------------------------------------------------------------

export const chatHistoryItemSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.number().optional(),
  createdAt: z.string().optional(),
});

export const chatHistoryPageSchema = z.object({
  items: z.array(chatHistoryItemSchema),
  nextCursor: z.string().nullable(),
});

export const chatHistoryResponseSchema = z.union([
  z.array(chatHistoryItemSchema),
  chatHistoryPageSchema,
]);

export type ChatHistoryResponse = z.infer<typeof chatHistoryResponseSchema>;

// ---------------------------------------------------------------------------
// Books list — /api/books
//
// The library grid dereferences id/title/author directly; progress and
// status drive filtering UI. Dates arrive as ISO strings (the shared Book
// type says Date, but JSON transport is strings and every consumer treats
// them opaquely), so they're validated as strings and the call-site
// generic stays Book[] via the structural cast in useLibraryBooks.
// ---------------------------------------------------------------------------

export const bookListItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  author: z.string(),
  coverUrl: z.string().nullable().optional(),
  fileType: z.enum(['epub', 'pdf']),
  fileSize: z.number(),
  totalPages: z.number(),
  currentPage: z.number(),
  currentSegment: z.number().optional(),
  progress: z.number(),
  status: z.enum(['unread', 'reading', 'completed']),
  tags: z.array(z.string()),
  addedAt: z.union([z.string(), z.date()]),
  startedAt: z.union([z.string(), z.date()]).nullable().optional(),
  completedAt: z.union([z.string(), z.date()]).nullable().optional(),
  lastReadAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export const bookListResponseSchema = z.array(bookListItemSchema);

export type BookListItem = z.infer<typeof bookListItemSchema>;
