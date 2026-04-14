// ============================================================================
// Shared Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
  settings: UserSettings;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  fontFamily: string;
  readingGoal: number; // books per month
  notificationsEnabled: boolean;
  friendPersonality?: 'sage' | 'penny' | 'alex' | 'quinn' | 'sam';
  interventionFrequency: 'minimal' | 'normal' | 'frequent';
}

export interface Book {
  id: string;
  userId: string;
  title: string;
  author: string;
  coverUrl?: string;
  fileType: 'epub' | 'pdf';
  fileSize: number;
  totalPages: number;
  currentPage: number;
  progress: number; // 0-1
  status: 'unread' | 'reading' | 'completed';
  tags: string[];
  addedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastReadAt?: Date;
  metadata?: BookMetadata;
}

export interface BookMetadata {
  isbn?: string;
  publishYear?: number;
  publisher?: string;
  genre?: string[];
  description?: string;
  language?: string;
}

export interface Document {
  id: string;
  bookId: string;
  userId: string;
  content: string; // Extracted text content
  chapters: Chapter[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  rawContent?: string;
  startIndex: number;
  endIndex: number;
  order: number;
}

export interface Annotation {
  id: string;
  userId: string;
  bookId: string;
  type: 'highlight' | 'note' | 'bookmark';
  location: AnnotationLocation;
  content: string; // Highlighted text or note content
  color?: string;
  note?: string; // For highlights that have notes
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnotationLocation {
  chapterId?: string;
  pageIndex?: number;
  position: number; // Character position in document
  selection: {
    start: number;
    end: number;
  };
}

export interface ReadingSession {
  id: string;
  userId: string;
  bookId: string;
  startedAt: Date;
  endedAt?: Date;
  duration: number; // seconds
  pagesRead: number;
  highlights: number;
  notes: number;
}

export interface AgentMessage {
  id: string;
  userId: string;
  sessionId: string;
  agent: 'companion' | 'research' | 'coach' | 'synthesis';
  role: 'user' | 'assistant';
  content: string;
  context?: MessageContext;
  toolsUsed?: string[];
  createdAt: Date;
}

export interface MessageContext {
  bookId?: string;
  location?: AnnotationLocation;
  relatedAnnotations?: string[];
}

export interface Memory {
  id: string;
  userId: string;
  type: 'user_preference' | 'reading_context' | 'conversation_history' | 'knowledge_connection';
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface KnowledgeNode {
  id: string;
  userId: string;
  type: 'concept' | 'person' | 'place' | 'event' | 'quote';
  label: string;
  description?: string;
  sources: KnowledgeSource[];
  connections: KnowledgeConnection[];
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeSource {
  bookId: string;
  location: AnnotationLocation;
  context: string;
}

export interface KnowledgeConnection {
  targetNodeId: string;
  relationship: string;
  strength: number; // 0-1
}

export interface ReadingFriend {
  id: string;
  userId: string;
  personality: 'sage' | 'penny' | 'alex' | 'quinn' | 'sam';
  name: string;
  relationshipLevel: number; // 0-100
  memories: FriendMemory[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FriendMemory {
  type: 'shared_moment' | 'breakthrough' | 'preference' | 'inside_joke';
  content: string;
  date: Date;
  emotionalWeight: number; // 0-1
}

// API Request/Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  type: 'reading_reminder' | 'streak_alert' | 'streak_milestone' | 'friend_message' | 'book_completed' | 'goal_progress';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

// Challenge Types
export interface Challenge {
  id: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly';
  target: number;
  unit: string;
  icon: string;
  progress: number;
  completed: boolean;
  percentage: number;
}

// Recommendation Types
export interface BookRecommendation {
  title: string;
  author: string;
  genre: string;
  reason: string;
  relevance: number;
}

// Friend Conversation Types
export interface FriendConversationMessage {
  id: string;
  userId: string;
  persona: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
  context?: Record<string, unknown>;
  createdAt: Date;
}

export interface FriendRelationshipData {
  id: string;
  userId: string;
  persona: string;
  booksReadTogether: number;
  sharedMoments: string[];
  totalMessages: number;
  lastInteractionAt?: Date;
}

