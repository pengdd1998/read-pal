// ============================================================================
// Constants
// ============================================================================

export const API_ROUTES = {
  // Auth
  AUTH_LOGIN: '/api/auth/login',
  AUTH_LOGOUT: '/api/auth/logout',
 _AUTH_CALLBACK: '/api/auth/callback',
  AUTH_ME: '/api/auth/me',

  // Books
  BOOKS: '/api/books',
  BOOK_DETAIL: (id: string) => `/api/books/${id}`,
  BOOK_UPLOAD: '/api/books/upload',
  BOOK_CONTENT: (id: string) => `/api/books/${id}/content`,

  // Annotations
  ANNOTATIONS: '/api/annotations',
  ANNOTATION_DETAIL: (id: string) => `/api/annotations/${id}`,
  ANNOTATIONS_BY_BOOK: (bookId: string) => `/api/books/${bookId}/annotations`,

  // Agents
  AGENTS: '/api/agents',
  AGENT_CHAT: (agent: string) => `/api/agents/${agent}/chat`,
  AGENT_HISTORY: (agent: string) => `/api/agents/${agent}/history`,

  // Library
  LIBRARY_SEARCH: '/api/library/search',
  LIBRARY_STATS: '/api/library/stats',

  // Knowledge
  KNOWLEDGE_NODES: '/api/knowledge/nodes',
  KNOWLEDGE_CONNECTIONS: '/api/knowledge/connections',
  KNOWLEDGE_GRAPH: '/api/knowledge/graph',

  // Reading Friend
  FRIEND_CONFIG: '/api/friend/config',
  FRIEND_CHAT: '/api/friend/chat',
  FRIEND_MEMORIES: '/api/friend/memories',
} as const;

export const READING_FRIENDS = {
  sage: {
    name: 'Sage',
    personality: 'thoughtful and reflective',
    tone: 'wise but not arrogant',
    speechPattern: 'asks probing questions',
  },
  penny: {
    name: 'Penny',
    personality: 'enthusiastic and curious',
    tone: 'excited about learning',
    speechPattern: 'expressive with exclamations',
  },
  alex: {
    name: 'Alex',
    personality: 'challenging and skeptical',
    tone: 'intellectually provocative',
    speechPattern: 'asks difficult questions',
  },
  quinn: {
    name: 'Quinn',
    personality: 'calm and minimalist',
    tone: 'quiet but insightful',
    speechPattern: 'speaks rarely but meaningfully',
  },
  sam: {
    name: 'Sam',
    personality: 'practical and goal-oriented',
    tone: 'encouraging and focused',
    speechPattern: 'action-oriented suggestions',
  },
} as const;

export const ANNOTATION_COLORS = [
  '#FFEB3B', // Yellow
  '#FF9800', // Orange
  '#4CAF50', // Green
  '#2196F3', // Blue
  '#9C27B0', // Purple
  '#F44336', // Red
] as const;

export const SUPPORTED_FILE_TYPES = [
  'application/epub+zip',
  'application/pdf',
] as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;
