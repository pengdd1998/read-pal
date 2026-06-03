export interface Endpoint {
  method: string;
  path: string;
  description: string;
  auth: boolean;
}

export const endpoints: Endpoint[] = [
  // Auth
  { method: 'POST', path: '/api/auth/register', description: 'Create account', auth: false },
  { method: 'POST', path: '/api/auth/login', description: 'Login (returns JWT)', auth: false },
  { method: 'POST', path: '/api/auth/forgot-password', description: 'Request password reset', auth: false },

  // Books
  { method: 'GET', path: '/api/books', description: 'List books (paginated)', auth: true },
  { method: 'POST', path: '/api/books', description: 'Add a book', auth: true },
  { method: 'GET', path: '/api/books/:id', description: 'Get book details', auth: true },
  { method: 'PATCH', path: '/api/books/:id', description: 'Update book', auth: true },
  { method: 'DELETE', path: '/api/books/:id', description: 'Delete book', auth: true },

  // Annotations
  { method: 'GET', path: '/api/annotations?bookId=', description: 'List annotations for a book', auth: true },
  { method: 'POST', path: '/api/annotations', description: 'Create annotation', auth: true },
  { method: 'DELETE', path: '/api/annotations/:id', description: 'Delete annotation', auth: true },
  { method: 'GET', path: '/api/v1/export/:bookId/:format', description: 'Export annotations (markdown, csv, bibtex, apa, etc.)', auth: true },

  // Reading Sessions
  { method: 'POST', path: '/api/reading-sessions', description: 'Start reading session', auth: true },
  { method: 'PATCH', path: '/api/reading-sessions/:id', description: 'End reading session', auth: true },
  { method: 'GET', path: '/api/reading-sessions?bookId=', description: 'List sessions for a book', auth: true },

  // Stats
  { method: 'GET', path: '/api/stats/dashboard', description: 'Dashboard stats overview', auth: true },
  { method: 'GET', path: '/api/stats/reading-calendar', description: '30-day reading activity', auth: true },
  { method: 'GET', path: '/api/stats/reading-speed', description: 'WPM + 7-day trend', auth: true },
  { method: 'GET', path: '/api/stats/reading-speed/by-book', description: 'Per-book speed comparison', auth: true },

  // Export
  { method: 'GET', path: '/api/export', description: 'Full data export (JSON)', auth: true },
  { method: 'GET', path: '/api/export/csv?type=annotations|books|sessions', description: 'CSV export for data analysis', auth: true },

  // Flashcards
  { method: 'GET', path: '/api/flashcards?bookId=', description: 'List flashcards for a book', auth: true },
  { method: 'POST', path: '/api/flashcards', description: 'Create flashcard', auth: true },
  { method: 'POST', path: '/api/flashcards/:id/review', description: 'Submit SM-2 review result', auth: true },

  // API Keys
  { method: 'GET', path: '/api/api-keys', description: 'List your API keys (masked)', auth: true },
  { method: 'POST', path: '/api/api-keys', description: 'Create new API key', auth: true },
  { method: 'DELETE', path: '/api/api-keys/:id', description: 'Revoke API key', auth: true },

  // Webhooks
  { method: 'GET', path: '/api/webhooks', description: 'List your webhooks', auth: true },
  { method: 'POST', path: '/api/webhooks', description: 'Create webhook', auth: true },
  { method: 'PATCH', path: '/api/webhooks/:id', description: 'Update webhook', auth: true },
  { method: 'DELETE', path: '/api/webhooks/:id', description: 'Delete webhook', auth: true },
  { method: 'POST', path: '/api/webhooks/:id/test', description: 'Send test ping', auth: true },
  { method: 'GET', path: '/api/webhooks/events', description: 'List available event types', auth: true },

  // AI Companion
  { method: 'POST', path: '/api/agents/chat', description: 'Chat with AI companion', auth: true },
];

export function methodColor(method: string): string {
  switch (method) {
    case 'GET': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'POST': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'PATCH': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'DELETE': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}
