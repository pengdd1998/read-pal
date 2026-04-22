'use client';

export interface DashboardStats {
  booksRead: number;
  totalPages: number;
  pagesRead: number;
  readingStreak: number;
  totalTime: string;
  conceptsLearned: number;
  connections: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentBooks: RecentBook[];
  weeklyActivity: { day: string; pages: number }[];
  booksByStatus: { unread: number; reading: number; completed: number };
}

export interface RecentBook {
  id: string;
  title: string;
  author: string;
  progress: number;
  lastRead: string;
  coverUrl?: string;
}

export interface AgentInsight {
  agent: string;
  icon: string;
  message: string;
}

export interface ChallengeItem {
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

export interface RecommendationItem {
  title: string;
  author: string;
  genre: string;
  reason: string;
  relevance: number;
}

export interface FlashcardStats {
  total: number;
  due: number;
  reviewed: number;
}
