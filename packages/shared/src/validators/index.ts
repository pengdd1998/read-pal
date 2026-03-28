// ============================================================================
// Validators
// ============================================================================

import { z } from 'zod';

// Auth
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

// Books
export const bookUploadSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  author: z.string().min(1, 'Author is required'),
  file: z.any()
    .refine((file) => file?.size > 0, 'File is required')
    .refine(
      (file) => file?.size <= 50 * 1024 * 1024,
      'File size must be less than 50MB'
    )
    .refine(
      (file) => ['application/epub+zip', 'application/pdf'].includes(file?.type),
      'Only EPUB and PDF files are supported'
    ),
});

export const bookUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  status: z.enum(['unread', 'reading', 'completed']).optional(),
  currentPage: z.number().int().min(0).optional(),
});

// Annotations
export const annotationSchema = z.object({
  bookId: z.string().uuid('Invalid book ID'),
  type: z.enum(['highlight', 'note', 'bookmark']),
  content: z.string().min(1, 'Content is required'),
  location: z.object({
    chapterId: z.string().optional(),
    pageIndex: z.number().int().min(0).optional(),
    position: z.number().int().min(0),
    selection: z.object({
      start: z.number().int().min(0),
      end: z.number().int().min(0),
    }),
  }),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format').optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const annotationUpdateSchema = z.object({
  content: z.string().min(1).optional(),
  note: z.string().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  tags: z.array(z.string()).optional(),
});

// Agents
export const agentChatSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  context: z.object({
    bookId: z.string().optional(),
    location: z.any().optional(),
  }).optional(),
});

// User Settings
export const userSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  fontSize: z.number().int().min(12).max(24).optional(),
  fontFamily: z.string().optional(),
  readingGoal: z.number().int().min(1).max(100).optional(),
  notificationsEnabled: z.boolean().optional(),
  friendPersonality: z.enum(['sage', 'penny', 'alex', 'quinn', 'sam']).optional(),
  interventionFrequency: z.enum(['minimal', 'normal', 'frequent']).optional(),
});

// Reading Friend
export const friendConfigSchema = z.object({
  personality: z.enum(['sage', 'penny', 'alex', 'quinn', 'sam']),
  name: z.string().min(1).optional(),
  interventionFrequency: z.enum(['minimal', 'normal', 'frequent']),
});

export const friendChatSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  bookId: z.string().optional(),
});

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Search
export const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  filters: z.object({
    type: z.enum(['books', 'annotations', 'knowledge']).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  ...paginationSchema.shape,
});
