// ============================================================================
// Constants
// ============================================================================

export const API_ROUTES = {
  // Auth
  AUTH_LOGIN: '/api/auth/login',
  AUTH_REGISTER: '/api/auth/register',
  AUTH_LOGOUT: '/api/auth/logout',
  AUTH_ME: '/api/auth/me',

  // Books
  BOOKS: '/api/books',
  BOOK_DETAIL: (id: string) => `/api/books/${id}`,
  BOOK_UPDATE: (id: string) => `/api/books/${id}`,
  BOOK_DELETE: (id: string) => `/api/books/${id}`,
  BOOK_UPLOAD: '/api/upload',
  BOOK_CONTENT: (id: string) => `/api/upload/books/${id}/content`,

  // Annotations
  ANNOTATIONS: '/api/annotations',
  ANNOTATION_DETAIL: (id: string) => `/api/annotations/${id}`,
  ANNOTATIONS_BY_BOOK: (bookId: string) => `/api/annotations?bookId=${bookId}`,

  // Agents
  AGENTS: '/api/agents',
  AGENT_CHAT: '/api/agents/chat', // agent type passed in request body
  AGENT_HISTORY: '/api/agents/history', // agent type passed in query params

  // Library
  LIBRARY_SEARCH: '/api/library/search',
  LIBRARY_STATS: '/api/stats/dashboard',

  // Stats
  STATS_DASHBOARD: '/api/stats/dashboard',

  // Knowledge
  KNOWLEDGE_NODES: '/api/knowledge/concepts',
  KNOWLEDGE_CONNECTIONS: '/api/knowledge/graph', // returns graph with connections
  KNOWLEDGE_GRAPH: '/api/knowledge/graph',

  // Reading Friend
  FRIEND_CONFIG: '/api/friend',
  FRIEND_CHAT: '/api/friend/chat',
  FRIEND_MEMORIES: '/api/friend/memories',
  FRIEND_REACT: '/api/friend/react',

  // Memory Books
  MEMORY_BOOKS: '/api/memory-books',
  MEMORY_BOOK_DETAIL: (id: string) => `/api/memory-books/${id}`,
  MEMORY_BOOK_GENERATE: (id: string) => `/api/memory-books/${id}/generate`,

  // Notifications
  NOTIFICATIONS: '/api/notifications',
  NOTIFICATIONS_UNREAD: '/api/notifications/unread-count',
  NOTIFICATION_DETAIL: (id: string) => `/api/notifications/${id}/read`,
  NOTIFICATIONS_MARK_ALL_READ: '/api/notifications/mark-all-read',

  // Recommendations
  RECOMMENDATIONS: '/api/recommendations',

  // Challenges
  CHALLENGES: '/api/challenges',

  // Settings
  SETTINGS: '/api/settings',

  // Reading Sessions
  READING_SESSIONS: '/api/reading-sessions',
  READING_SESSION_START: '/api/reading-sessions/start',
  READING_SESSION_HEARTBEAT: (id: string) => `/api/reading-sessions/${id}/heartbeat`,
  READING_SESSION_END: (id: string) => `/api/reading-sessions/${id}/end`,

  // Auth (additional)
  AUTH_FORGOT_PASSWORD: '/api/auth/forgot-password',

  // Stats (additional)
  STATS_CALENDAR: '/api/stats/reading-calendar',

  // Friend (additional)
  FRIEND_HISTORY: '/api/friend/history',
  FRIEND_RELATIONSHIP: '/api/friend/relationship',
  FRIEND_PERSONAS: '/api/friend/personas',
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
