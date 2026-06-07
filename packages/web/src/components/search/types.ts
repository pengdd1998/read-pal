export interface Book {
  id: string;
  title: string;
  author: string;
  progress: number;
  status: string;
  coverUrl?: string;
}

export interface Highlight {
  id: string;
  content: string;
  type: string;
  bookId: string;
  bookTitle?: string;
  createdAt: string;
}
