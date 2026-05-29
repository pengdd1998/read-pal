export interface BookData {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  status: 'unread' | 'reading' | 'completed';
  progress: number;
  currentPage: number;
  totalPages: number;
  addedAt: string;
  lastReadAt?: string;
  completedAt?: string;
}

export interface AnnotationStats {
  highlights: number;
  notes: number;
  bookmarks: number;
}

export interface AnnotationItem {
  id: string;
  type: string;
  content: string;
  note?: string;
  tags?: string[];
  createdAt: string;
  location?: { chapterIndex?: number };
}

export interface ReadingLogEntry {
  id: string;
  startedAt: string;
  duration: number;
  pagesRead: number;
  highlights: number;
  notes: number;
  summary?: string;
}

export interface OutlineChapter {
  chapterIndex: number;
  label: string;
  highlights: AnnotationItem[];
  notes: AnnotationItem[];
  bookmarks: AnnotationItem[];
}
