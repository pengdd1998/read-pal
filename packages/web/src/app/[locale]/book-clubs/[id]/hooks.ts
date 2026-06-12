'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
import type { ClubDetail, MemberProgress, DiscussionMessage } from './types';

export function useBookClubDetail(clubId: string) {
  const t = useTranslations('bookClubs');
  const tRef = useRef(t);
  tRef.current = t;
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;

    async function fetch() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<ClubDetail>(`/api/book-clubs/${clubId}`);
        if (!cancelled && res.success && res.data) {
          setClub(res.data);
        }
      } catch (err) {
        warn('useBookClubDetail: fetch failed', err);
        if (!cancelled) setError(tRef.current('failedToLoad'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [clubId, fetchKey]);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  return { club, setClub, loading, error, setError, refetch };
}

export function useBookClubProgress(clubId: string, currentBookId?: string) {
  const t = useTranslations('bookClubs');
  const tRef = useRef(t);
  tRef.current = t;
  const [progress, setProgress] = useState<MemberProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clubId || !currentBookId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ hasBook: boolean; progress: MemberProgress[] }>(`/api/book-clubs/${clubId}/progress`)
      .then((res) => {
        if (!cancelled && res.success && res.data?.progress) {
          setProgress(res.data.progress);
        }
      })
      .catch((err) => {
        warn('useBookClubProgress: fetch failed', err);
        if (!cancelled) setError(tRef.current('progress_failed_load'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clubId, currentBookId]);

  return { progress, loading, error };
}

export function useBookClubDiscussion(clubId: string) {
  const t = useTranslations('bookClubs');
  const tRef = useRef(t);
  tRef.current = t;
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    setError(null);
    setLoading(true);

    api
      .get<{ data: DiscussionMessage[] }>(`/api/book-clubs/${clubId}/discussions?limit=50`)
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setMessages(Array.isArray(res.data) ? res.data : []);
        }
      })
      .catch((err) => {
        warn('useBookClubDiscussion: fetch failed', err);
        if (!cancelled) setError(tRef.current('discussions_failed_load'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clubId, fetchKey]);

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await api.post<DiscussionMessage>(`/api/book-clubs/${clubId}/discussions`, {
        content: newMessage.trim(),
      });
      if (res.success && res.data) {
        setMessages((prev) => [...prev, res.data as DiscussionMessage]);
        setNewMessage('');
      } else {
        setSendError(tRef.current('failedToSend'));
      }
    } catch (err) {
      warn('useBookClubDiscussion: sendMessage failed', err);
      setSendError(tRef.current('failedToSend'));
    } finally {
      setSending(false);
    }
  }, [clubId, newMessage, sending]);

  const clearSendError = useCallback(() => setSendError(null), []);

  return { messages, loading, newMessage, setNewMessage, sending, sendMessage, error, sendError, clearSendError, refetch };
}
