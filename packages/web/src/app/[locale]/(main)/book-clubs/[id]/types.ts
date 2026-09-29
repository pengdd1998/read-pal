export interface MemberUser {
  id: string;
  name: string;
  email: string;
}

export interface ClubMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  user?: MemberUser;
}

export interface CurrentBook {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  progress: number;
}

export interface ClubDetail {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  inviteCode: string;
  maxMembers: number;
  memberCount: number;
  currentBookId?: string;
  currentUserRole: string | null;
  clubMembers: ClubMember[];
  currentBook?: CurrentBook | null;
}

export interface MemberProgress {
  userId: string;
  title: string;
  author: string;
  progress: number;
  currentPage: number;
  totalPages: number;
  status: string;
  user: { id: string; name: string };
}

export interface DiscussionMessage {
  id: string;
  clubId: string;
  userId: string;
  content: string;
  createdAt: string;
  author?: { id: string; name: string };
}
