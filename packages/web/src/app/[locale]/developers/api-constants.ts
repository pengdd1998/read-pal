export interface Endpoint {
  method: string;
  path: string;
  descriptionKey: string;
  auth: boolean;
}

export const endpoints: Endpoint[] = [
  // Auth
  { method: 'POST', path: '/api/auth/register', descriptionKey: 'desc_auth_register', auth: false },
  { method: 'POST', path: '/api/auth/login', descriptionKey: 'desc_auth_login', auth: false },
  { method: 'POST', path: '/api/auth/forgot-password', descriptionKey: 'desc_auth_forgot', auth: false },

  // Books
  { method: 'GET', path: '/api/books', descriptionKey: 'desc_books_list', auth: true },
  { method: 'POST', path: '/api/books', descriptionKey: 'desc_books_add', auth: true },
  { method: 'GET', path: '/api/books/:id', descriptionKey: 'desc_books_get', auth: true },
  { method: 'PATCH', path: '/api/books/:id', descriptionKey: 'desc_books_update', auth: true },
  { method: 'DELETE', path: '/api/books/:id', descriptionKey: 'desc_books_delete', auth: true },

  // Annotations
  { method: 'GET', path: '/api/annotations?bookId=', descriptionKey: 'desc_annotations_list', auth: true },
  { method: 'POST', path: '/api/annotations', descriptionKey: 'desc_annotations_create', auth: true },
  { method: 'DELETE', path: '/api/annotations/:id', descriptionKey: 'desc_annotations_delete', auth: true },
  { method: 'GET', path: '/api/v1/export/:bookId/:format', descriptionKey: 'desc_annotations_export', auth: true },

  // Reading Sessions
  { method: 'POST', path: '/api/reading-sessions', descriptionKey: 'desc_sessions_start', auth: true },
  { method: 'PATCH', path: '/api/reading-sessions/:id', descriptionKey: 'desc_sessions_end', auth: true },
  { method: 'GET', path: '/api/reading-sessions?bookId=', descriptionKey: 'desc_sessions_list', auth: true },

  // Stats
  { method: 'GET', path: '/api/stats/dashboard', descriptionKey: 'desc_stats_dashboard', auth: true },
  { method: 'GET', path: '/api/stats/reading-calendar', descriptionKey: 'desc_stats_calendar', auth: true },
  { method: 'GET', path: '/api/stats/reading-speed', descriptionKey: 'desc_stats_speed', auth: true },
  { method: 'GET', path: '/api/stats/reading-speed/by-book', descriptionKey: 'desc_stats_by_book', auth: true },

  // Export
  { method: 'GET', path: '/api/export', descriptionKey: 'desc_export_json', auth: true },
  { method: 'GET', path: '/api/export/csv?type=annotations|books|sessions', descriptionKey: 'desc_export_csv', auth: true },

  // Flashcards
  { method: 'GET', path: '/api/flashcards?bookId=', descriptionKey: 'desc_flashcards_list', auth: true },
  { method: 'POST', path: '/api/flashcards', descriptionKey: 'desc_flashcards_create', auth: true },
  { method: 'POST', path: '/api/flashcards/:id/review', descriptionKey: 'desc_flashcards_review', auth: true },

  // API Keys
  { method: 'GET', path: '/api/api-keys', descriptionKey: 'desc_apikeys_list', auth: true },
  { method: 'POST', path: '/api/api-keys', descriptionKey: 'desc_apikeys_create', auth: true },
  { method: 'DELETE', path: '/api/api-keys/:id', descriptionKey: 'desc_apikeys_revoke', auth: true },

  // Webhooks
  { method: 'GET', path: '/api/webhooks', descriptionKey: 'desc_webhooks_list', auth: true },
  { method: 'POST', path: '/api/webhooks', descriptionKey: 'desc_webhooks_create', auth: true },
  { method: 'PATCH', path: '/api/webhooks/:id', descriptionKey: 'desc_webhooks_update', auth: true },
  { method: 'DELETE', path: '/api/webhooks/:id', descriptionKey: 'desc_webhooks_delete', auth: true },
  { method: 'POST', path: '/api/webhooks/:id/test', descriptionKey: 'desc_webhooks_test', auth: true },
  { method: 'GET', path: '/api/webhooks/events', descriptionKey: 'desc_webhooks_events', auth: true },

  // AI Companion
  { method: 'POST', path: '/api/agents/chat', descriptionKey: 'desc_companion_chat', auth: true },
];

export function methodColor(method: string): string {
  switch (method) {
    case 'GET': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'POST': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'PATCH': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'DELETE': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-800';
  }
}
