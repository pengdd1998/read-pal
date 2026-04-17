/**
 * OpenAPI Specification Route
 *
 * Serves a generated OpenAPI 3.0 spec for the read-pal API.
 * Public endpoint — no auth required.
 */

import { Router, Response } from 'express';

const router: Router = Router();

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'read-pal API',
    version: '1.0.0',
    description: 'AI reading companion — manage books, annotations, reading sessions, flashcards, exports, and more.',
    contact: { name: 'read-pal', url: 'https://github.com/pengdd1998/read-pal' },
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Development' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'JWT token or API key (rpk_...)',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'ERROR_CODE' },
              message: { type: 'string', example: 'Description' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      Book: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          author: { type: 'string' },
          status: { type: 'string', enum: ['unread', 'reading', 'completed', 'abandoned'] },
          progress: { type: 'number', minimum: 0, maximum: 100 },
          totalPages: { type: 'integer' },
          currentPage: { type: 'integer' },
          tags: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Annotation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          bookId: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['highlight', 'note', 'bookmark'] },
          content: { type: 'string' },
          note: { type: 'string' },
          color: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          location: {
            type: 'object',
            properties: {
              pageNumber: { type: 'integer' },
              chapterIndex: { type: 'integer' },
              cfi: { type: 'string' },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ReadingSession: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          bookId: { type: 'string', format: 'uuid' },
          duration: { type: 'number', description: 'Duration in seconds' },
          pagesRead: { type: 'integer' },
          startedAt: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time' },
        },
      },
      Flashcard: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          bookId: { type: 'string', format: 'uuid' },
          front: { type: 'string' },
          back: { type: 'string' },
          easeFactor: { type: 'number' },
          interval: { type: 'integer' },
          nextReview: { type: 'string', format: 'date-time' },
        },
      },
      ApiKey: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          keyPrefix: { type: 'string' },
          lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Webhook: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          url: { type: 'string', format: 'uri' },
          events: { type: 'array', items: { type: 'string' } },
          isActive: { type: 'boolean' },
          lastDeliveryAt: { type: 'string', format: 'date-time', nullable: true },
          lastDeliveryStatus: { type: 'integer', nullable: true },
          failureCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Account created' },
          '400': { description: 'Validation error' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login (returns JWT)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { email: { type: 'string' }, password: { type: 'string' } },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'JWT token returned' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request password reset',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
            },
          },
        },
        responses: { '200': { description: 'Reset email sent' } },
      },
    },
    '/api/books': {
      get: {
        tags: ['Books'],
        summary: 'List books (paginated)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['unread', 'reading', 'completed', 'abandoned'] } },
        ],
        responses: { '200': { description: 'Paginated list of books' } },
      },
      post: {
        tags: ['Books'],
        summary: 'Add a book',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  author: { type: 'string' },
                  totalPages: { type: 'integer' },
                  tags: { type: 'array', items: { type: 'string' } },
                },
                required: ['title'],
              },
            },
          },
        },
        responses: { '201': { description: 'Book created' } },
      },
    },
    '/api/books/{id}': {
      get: {
        tags: ['Books'],
        summary: 'Get book details',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Book details' }, '404': { description: 'Not found' } },
      },
      patch: {
        tags: ['Books'],
        summary: 'Update book',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Book updated' } },
      },
      delete: {
        tags: ['Books'],
        summary: 'Delete book',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Book deleted' }, '404': { description: 'Not found' } },
      },
    },
    '/api/annotations': {
      get: {
        tags: ['Annotations'],
        summary: 'List annotations for a book',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'bookId', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'List of annotations' } },
      },
      post: {
        tags: ['Annotations'],
        summary: 'Create annotation',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  bookId: { type: 'string', format: 'uuid' },
                  type: { type: 'string', enum: ['highlight', 'note', 'bookmark'] },
                  content: { type: 'string' },
                  note: { type: 'string' },
                  color: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  location: { type: 'object' },
                },
                required: ['bookId', 'type', 'content'],
              },
            },
          },
        },
        responses: { '201': { description: 'Annotation created' } },
      },
    },
    '/api/annotations/{id}': {
      delete: {
        tags: ['Annotations'],
        summary: 'Delete annotation',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Deleted' }, '404': { description: 'Not found' } },
      },
    },
    '/api/annotations/export/{bookId}': {
      get: {
        tags: ['Annotations'],
        summary: 'Export annotations in various formats',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'bookId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['markdown', 'csv', 'bibtex', 'apa', 'mla', 'chicago', 'research', 'annotated_bib', 'study_guide', 'bookclub', 'csv'] } },
        ],
        responses: { '200': { description: 'Exported content' } },
      },
    },
    '/api/reading-sessions': {
      post: {
        tags: ['Reading Sessions'],
        summary: 'Start reading session',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { bookId: { type: 'string', format: 'uuid' } },
                required: ['bookId'],
              },
            },
          },
        },
        responses: { '201': { description: 'Session started' } },
      },
    },
    '/api/reading-sessions/{id}': {
      patch: {
        tags: ['Reading Sessions'],
        summary: 'End reading session',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Session ended' } },
      },
    },
    '/api/stats/dashboard': {
      get: {
        tags: ['Stats'],
        summary: 'Dashboard stats overview',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Dashboard statistics' } },
      },
    },
    '/api/stats/reading-calendar': {
      get: {
        tags: ['Stats'],
        summary: '30-day reading activity',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Reading calendar data' } },
      },
    },
    '/api/stats/reading-speed': {
      get: {
        tags: ['Stats'],
        summary: 'WPM + 7-day trend',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Reading speed data' } },
      },
    },
    '/api/stats/reading-speed/by-book': {
      get: {
        tags: ['Stats'],
        summary: 'Per-book speed comparison',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Speed data per book' } },
      },
    },
    '/api/export': {
      get: {
        tags: ['Export'],
        summary: 'Full data export (JSON)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Full user data export' } },
      },
    },
    '/api/export/csv': {
      get: {
        tags: ['Export'],
        summary: 'CSV export for data analysis',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['annotations', 'books', 'sessions'], default: 'annotations' } },
        ],
        responses: { '200': { description: 'CSV file download' } },
      },
    },
    '/api/flashcards': {
      get: {
        tags: ['Flashcards'],
        summary: 'List flashcards for a book',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'bookId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'List of flashcards' } },
      },
      post: {
        tags: ['Flashcards'],
        summary: 'Create flashcard',
        security: [{ BearerAuth: [] }],
        responses: { '201': { description: 'Flashcard created' } },
      },
    },
    '/api/flashcards/{id}/review': {
      post: {
        tags: ['Flashcards'],
        summary: 'Submit SM-2 review result',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Review recorded' } },
      },
    },
    '/api/api-keys': {
      get: {
        tags: ['API Keys'],
        summary: 'List your API keys (masked)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of API keys' } },
      },
      post: {
        tags: ['API Keys'],
        summary: 'Create new API key',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
            },
          },
        },
        responses: { '201': { description: 'API key created (plain key shown once)' } },
      },
    },
    '/api/api-keys/{id}': {
      delete: {
        tags: ['API Keys'],
        summary: 'Revoke API key',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Key revoked' }, '404': { description: 'Not found' } },
      },
    },
    '/api/agents/chat': {
      post: {
        tags: ['AI Companion'],
        summary: 'Chat with AI companion',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  bookId: { type: 'string', format: 'uuid' },
                  context: { type: 'object' },
                },
                required: ['message'],
              },
            },
          },
        },
        responses: { '200': { description: 'AI response' } },
      },
    },
    '/api/collections': {
      get: {
        tags: ['Collections'],
        summary: 'List collections',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of collections' } },
      },
      post: {
        tags: ['Collections'],
        summary: 'Create collection',
        security: [{ BearerAuth: [] }],
        responses: { '201': { description: 'Collection created' } },
      },
    },
    '/api/book-clubs': {
      get: {
        tags: ['Book Clubs'],
        summary: 'List book clubs',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of clubs' } },
      },
      post: {
        tags: ['Book Clubs'],
        summary: 'Create book club',
        security: [{ BearerAuth: [] }],
        responses: { '201': { description: 'Club created' } },
      },
    },
    '/api/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List notifications',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of notifications' } },
      },
    },
    '/api/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Get user settings',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'User settings' } },
      },
      patch: {
        tags: ['Settings'],
        summary: 'Update user settings',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Settings updated' } },
      },
    },
    '/api/settings/reading-goals': {
      get: {
        tags: ['Settings'],
        summary: 'Get reading goal progress',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Goal progress data' } },
      },
    },
    '/api/zotero/status': {
      get: {
        tags: ['Zotero'],
        summary: 'Check Zotero connection status',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Connection status' } },
      },
    },
    '/api/zotero/export/{bookId}': {
      post: {
        tags: ['Zotero'],
        summary: 'Export book to Zotero',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'bookId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Exported to Zotero' } },
      },
    },
    '/api/zotero/batch-export': {
      post: {
        tags: ['Zotero'],
        summary: 'Export all completed books to Zotero',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Batch export complete' } },
      },
    },
    '/api/webhooks': {
      get: {
        tags: ['Webhooks'],
        summary: 'List your webhooks',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of webhooks' } },
      },
      post: {
        tags: ['Webhooks'],
        summary: 'Create webhook',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  url: { type: 'string', format: 'uri' },
                  events: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: [
                        'annotation.created', 'annotation.updated', 'annotation.deleted',
                        'book.started', 'book.completed', 'book.updated',
                        'session.started', 'session.ended',
                        'flashcard.created', 'flashcard.reviewed',
                      ],
                    },
                  },
                },
                required: ['url', 'events'],
              },
            },
          },
        },
        responses: { '201': { description: 'Webhook created (secret shown once)' } },
      },
    },
    '/api/webhooks/{id}': {
      patch: {
        tags: ['Webhooks'],
        summary: 'Update webhook',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Webhook updated' } },
      },
      delete: {
        tags: ['Webhooks'],
        summary: 'Delete webhook',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/api/webhooks/{id}/test': {
      post: {
        tags: ['Webhooks'],
        summary: 'Send test ping to webhook endpoint',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Test result with status and latency' } },
      },
    },
    '/api/webhooks/events': {
      get: {
        tags: ['Webhooks'],
        summary: 'List available webhook event types',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of event types' } },
      },
    },
  },
  tags: [
    { name: 'Auth', description: 'Authentication & account management' },
    { name: 'Books', description: 'Book CRUD operations' },
    { name: 'Annotations', description: 'Highlights, notes, bookmarks' },
    { name: 'Reading Sessions', description: 'Reading time tracking' },
    { name: 'Stats', description: 'Reading statistics & analytics' },
    { name: 'Export', description: 'Data export (JSON, CSV, citations)' },
    { name: 'Flashcards', description: 'Spaced repetition flashcards' },
    { name: 'API Keys', description: 'Personal access token management' },
    { name: 'AI Companion', description: 'AI chat with reading context' },
    { name: 'Collections', description: 'Book collections / bookshelves' },
    { name: 'Book Clubs', description: 'Group reading & discussions' },
    { name: 'Notifications', description: 'Reading reminders & alerts' },
    { name: 'Settings', description: 'User preferences & configuration' },
    { name: 'Zotero', description: 'Zotero integration' },
    { name: 'Webhooks', description: 'HTTP callbacks for external integrations' },
  ],
};

router.get('/openapi.json', (_req, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  // Allow Swagger UI to fetch the spec cross-origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(spec);
});

export default router;
