export interface ReadingStats {
  booksRead: number;
  totalPages: number;
  pagesRead: number;
  readingStreak: number;
  totalTime: string;
  conceptsLearned: number;
  connections: number;
  chatMessageCount?: number;
  memoryBookCount?: number;
}

export interface BookProgress {
  id: string;
  title: string;
  author: string;
  progress: number;
  status: string;
  lastReadAt?: string;
}

export interface SessionData {
  date: string;
  duration: number;
  pagesRead: number;
}

export interface FlashcardStats {
  totalCards: number;
  reviewedCards: number;
  averageEaseFactor: number;
  dueToday: number;
  accuracy: number;
  retentionRate: number;
}

export interface SpeedData {
  averagePagesPerHour: number;
  averageWordsPerMinute: number;
  currentWpm: number;
  speedOverTime: Array<{ date: string; pagesPerHour: number }>;
}

export interface BookSpeed {
  bookId: string;
  title: string;
  author: string;
  wpm: number;
  totalSessions: number;
  totalPagesRead: number;
  totalMinutes: number;
}

export interface DashboardData {
  stats: ReadingStats;
  recentBooks: BookProgress[];
  weeklyActivity: { day: string; pages: number }[];
  booksByStatus: { unread: number; reading: number; completed: number };
}
