'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { ClubDetail, MemberProgress, DiscussionMessage } from './types';

export function useBookClubDetail(clubId: string) {
  const t = useTranslations('bookClubs');
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;

    async function fetch() {
      try {
        const res = await api.get<ClubDetail>(`/api/book-clubs/${clubId}`);
        if (!cancelled && res.success && res.data) {
          setClub(res.data);
        }
      } catch {
        if (!cancelled) setError(t('failedToLoad'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [clubId, t]);

  return { club, setClub, loading, error, setError };
}

export function useBookClubProgress(clubId: string, currentBookId?: string) {
  const [progress, setProgress] = useState<MemberProgress[]>([]);

  useEffect(() => {
    if (!clubId || !currentBookId) return;
    let cancelled = false;

    api
      .get<{ hasBook: boolean; progress: MemberProgress[] }>(`/api/book-clubs/${clubId}/progress`)
      .then((res) => {
        if (!cancelled && res.success && res.data?.progress) {
          setProgress(res.data.progress);
        }
      });

    return () => { cancelled = true; };
  }, [clubId, currentBookId]);

  return { progress };
}

export function useBookClubDiscussion(clubId: string) {
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;

    api
      .get<{ data: DiscussionMessage[] }>(`/api/book-clubs/${clubId}/discussions?limit=50`)
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setMessages(Array.isArray(res.data) ? res.data : []);
        }
      });

    return () => { cancelled = true; };
  }, [clubId]);

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      const res = await api.post<DiscussionMessage>(`/api/book-clubs/${clubId}/discussions`, {
        content: newMessage.trim(),
      });
      if (res.success && res.data) {
        setMessages((prev) => [...prev, res.data as DiscussionMessage]);
        setNewMessage('');
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }, [clubId, newMessage, sending]);

  return { messages, newMessage, setNewMessage, sending, sendMessage };
}
