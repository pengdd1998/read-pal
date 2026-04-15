// ============================================================================
// Core Types
// ============================================================================

/**
 * Supported LLM models
 */
export type LLMModel = string;

/**
 * Model selection strategy
 */
export interface ModelSelection {
  model: LLMModel;
  reason: string;
  estimatedCost: number;
}

/**
 * Memory type for agents
 */
export type MemoryType = 'none' | 'session' | 'persistent';

/**
 * Intervention style for proactive agents
 */
export type InterventionStyle = 'reactive' | 'proactive' | 'hybrid';

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Base agent interface
 */
export interface IAgent {
  name: string;
  displayName: string;
  version: string;
  purpose: string;
  responsibilities: string[];
  model: LLMModel;
  systemPrompt: string;
  tools: ITool[];
  memoryType: MemoryType;
  interventionStyle: InterventionStyle;

  execute(request: AgentRequest): Promise<AgentResponse>;
}

/**
 * Agent request
 */
export interface AgentRequest {
  userId: string;
  sessionId: string;
  action: string;
  input: unknown;
  context?: AgentContext;
  metadata?: Record<string, unknown>;
}

/**
 * Agent context
 */
export interface AgentContext {
  readingLocation?: BookLocation;
  currentBook?: BookReference;
  userUnderstandingLevel?: UnderstandingLevel;
  conversationHistory?: ConversationMessage[];
  userPreferences?: UserPreferences;
  sharedMemories?: SharedMemory[];
}

/**
 * Agent response
 */
export interface AgentResponse {
  success: boolean;
  content: string;
  data?: unknown;
  metadata?: AgentResponseMetadata;
  error?: AgentError;
}

/**
 * Agent response metadata
 */
export interface AgentResponseMetadata {
  modelUsed: LLMModel;
  tokensUsed: number;
  cost: number;
  duration: number;
  toolsUsed?: string[];
  reasoning?: string;
  agentName?: string;
}

/**
 * Agent error
 */
export interface AgentError {
  code: string;
  message: string;
  details?: unknown;
  recoverable: boolean;
}

// ============================================================================
// Tool Types
// ============================================================================

/**
 * Base tool interface
 */
export interface ITool {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: JSONSchema;
  handler: ToolHandler;
  timeout?: number;
  retryable?: boolean;
  cacheable?: boolean;
}

/**
 * Tool categories
 */
export type ToolCategory = 'database' | 'ai' | 'external' | 'memory';

/**
 * Tool handler function
 */
export type ToolHandler = (
  input: unknown,
  context: ToolContext
) => Promise<ToolResult>;

/**
 * Tool context
 */
export interface ToolContext {
  userId: string;
  sessionId: string;
  agentName: string;
  db: {
    postgres: { query<T>(text: string, params?: unknown[]): Promise<T[]> };
    redis: { get(key: string): Promise<string | null>; set(key: string, value: string, ttl?: number): Promise<void>; del(key: string): Promise<void> };
    pinecone: { query(index: string, vector: number[], topK: number): Promise<Match[]> };
    neo4j: { run(query: string, params?: Record<string, unknown>): Promise<Neo4jQueryResult> };
  };
  logger: Logger;
}

/**
 * Tool result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: ToolError;
}

/**
 * Tool error
 */
export interface ToolError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * JSON Schema for tool input validation
 */
export interface JSONSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    properties?: Record<string, unknown>;
    required?: string[];
  }>;
  required: string[];
}

// ============================================================================
// Domain Types
// ============================================================================

/**
 * Book reference
 */
export interface BookReference {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  type: 'ebook' | 'pdf' | 'audiobook' | 'webpage';
  source: BookSource;
  metadata?: BookMetadata;
}

/**
 * Book source
 */
export type BookSource =
  | 'upload'
  | 'url'
  | 'isbn'
  | 'google-books'
  | 'open-library'
  | 'goodreads';

/**
 * Book metadata
 */
export interface BookMetadata {
  pageCount?: number;
  publishedDate?: string;
  publisher?: string;
  language?: string;
  genres?: string[];
  description?: string;
  coverUrl?: string;
}

/**
 * Location in a book
 */
export interface BookLocation {
  bookId: string;
  type: 'page' | 'chapter' | 'section' | 'percentage';
  value: number | string;
  textSnippet?: string;
}

/**
 * User understanding level
 */
export type UnderstandingLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'expert';

/**
 * Conversation message
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Shared memory between user and agent
 */
export interface SharedMemory {
  id: string;
  type: MemoryType;
  key: string;
  value: unknown;
  timestamp: Date;
  bookId?: string;
  emotionalWeight?: number; // 0-1
  connections?: string[]; // Related memory IDs
}

/**
 * User preferences
 */
export interface UserPreferences {
  readingFriend: {
    personality: ReadingFriendPersona;
    interventionFrequency: 'minimal' | 'normal' | 'frequent';
    quietHours?: {
      start: string; // HH:mm
      end: string;   // HH:mm
    };
  };
  reading: {
    defaultFontSize: number;
    fontFamily: string;
    lineSpacing: number;
    theme: 'light' | 'dark' | 'sepia';
  };
  notifications: {
    enabled: boolean;
    types: NotificationType[];
  };
}

/**
 * Reading friend personalities
 */
export type ReadingFriendPersona =
  | 'sage'      // Wise, patient, asks deep questions
  | 'penny'     // Enthusiastic explorer
  | 'alex'      // Gentle challenger
  | 'quinn'     // Quiet companion
  | 'sam';      // Study buddy

/**
 * Notification types
 */
export type NotificationType =
  | 'reading_reminder'
  | 'review_due'
  | 'milestone'
  | 'friend_message'
  | 'insight';

// ============================================================================
// Database Types
// ============================================================================

/**
 * User entity
 */
export interface User {
  id: string;
  email: string;
  name: string;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Document entity
 */
export interface Document {
  id: string;
  userId: string;
  title: string;
  author: string;
  type: string;
  source: string;
  content: string;
  metadata: BookMetadata;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reading session entity
 */
export interface ReadingSession {
  id: string;
  userId: string;
  documentId: string;
  startTime: Date;
  endTime?: Date;
  progress: ReadingProgress;
  interactions: Array<{
    id: string;
    type: string;
    location: BookLocation;
    content: string;
    metadata?: Record<string, unknown>;
    timestamp: Date;
  }>;
  createdAt: Date;
}

/**
 * Reading progress
 */
export interface ReadingProgress {
  currentPage: number;
  totalPages: number;
  percentage: number;
  lastLocation: BookLocation;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: ResponseMetadata;
}

/**
 * API error
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
  timestamp: string;
  requestId: string;
  version: string;
}

// ============================================================================
// Reading Friend Types
// ============================================================================

/**
 * Reading friend configuration
 */
export interface ReadingFriendConfig {
  name: string;
  displayName: string;
  persona: ReadingFriendPersona;
  personality: PersonalityProfile;
  emoji: string;
}

/**
 * Personality profile
 */
export interface PersonalityProfile {
  tone: ToneStyle;
  humor: HumorLevel;
  formality: FormalityLevel;
  enthusiasm: EnthusiasmRange;
  interventionThreshold: number; // 0-1
  speechPatterns: SpeechPattern[];
  catchphrases: string[];
}

/**
 * Tone style
 */
export type ToneStyle =
  | 'wise'
  | 'enthusiastic'
  | 'challenging'
  | 'minimal'
  | 'practical';

/**
 * Humor level
 */
export type HumorLevel = 'none' | 'dry' | 'playful' | 'witty';

/**
 * Formality level
 */
export type FormalityLevel = 'casual' | 'semi-formal' | 'formal';

/**
 * Enthusiasm range
 */
export interface EnthusiasmRange {
  min: number; // 0-1
  max: number; // 0-1
}

/**
 * Speech pattern
 */
export interface SpeechPattern {
  pattern: string;
  frequency: number; // 0-1
  examples: string[];
}

/**
 * Memory book format
 */
export type MemoryBookFormat =
  | 'scrapbook'
  | 'chat_log'
  | 'journal'
  | 'video'
  | 'podcast';

/**
 * Reading journey
 */
export interface ReadingJourney {
  book: BookReference;
  user: User;
  friend: ReadingFriendConfig;
  timeline: JourneyMoment[];
  stats: JourneyStats;
  startDate: Date;
  endDate?: Date;
}

/**
 * Journey moment
 */
export interface JourneyMoment {
  id: string;
  timestamp: Date;
  location: BookLocation;
  type: MomentType;
  content: string;
  friendResponse?: string;
  emotionalWeight: number; // 0-1
  significance: number; // 0-1
}

/**
 * Moment types
 */
export type MomentType =
  | 'first_impression'
  | 'realization'
  | 'confusion'
  | 'debate'
  | 'breakthrough'
  | 'funny_moment'
  | 'conversation'
  | 'milestone';

/**
 * Journey stats
 */
export interface JourneyStats {
  duration: number; // days
  pagesRead: number;
  highlightsCount: number;
  conversationsCount: number;
  ahaMomentsCount: number;
  conceptsMastered: string[];
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

/**
 * Database client helper types
 */
export interface Vector {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
}

export interface Match {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface Neo4jQueryResult {
  records: Record<string, unknown>[];
}

// ============================================================================
// Environment Types
// ============================================================================

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
  nodeEnv: 'development' | 'staging' | 'production' | 'test';
  api: {
    port: number;
    url: string;
  };
  database: {
    url: string;
    poolMin: number;
    poolMax: number;
  };
  redis: {
    url: string;
    password?: string;
    db: number;
  };
  pinecone: {
    apiKey: string;
    environment: string;
    index: string;
  };
  neo4j: {
    uri: string;
    user: string;
    password: string;
  };
  glm: {
    apiKey: string;
    baseUrl: string;
    model: LLMModel;
    maxTokens: number;
    temperature: number;
    timeout: number;
  };
  auth: {
    provider: string;
    secret: string;
    domain?: string;
    clientId?: string;
    clientSecret?: string;
  };
  cors?: {
    origins: string[];
  };
  aws?: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    s3Bucket?: string;
  };
  sentry?: {
    dsn: string;
    environment: string;
    tracesSampleRate: number;
  };
  features: {
    readingFriend: boolean;
    knowledgeGraph: boolean;
    memoryBooks: boolean;
    collaborativeReading: boolean;
    ereaderIntegration: boolean;
  };
}

// ============================================================================
// Export all types
// ============================================================================
