'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { getAuthToken } from '@/lib/auth-fetch';
import { formatRelativeTime } from '@/lib/date';
import { useToast } from '@/components/Toast';
import { warn } from '@/lib/logger';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

function getNotificationIcon(type: string): React.ReactNode {
  const cls = 'w-4 h-4';
  switch (type) {
    case 'reading_reminder':
      return <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
    case 'streak_at_risk':
    case 'streak_milestone':
      return <svg aria-hidden="true" className={cls} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" /></svg>;
    case 'goal_achieved':
      return <svg aria-hidden="true" className={cls} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>;
    case 'system':
      return <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>;
    default:
      return <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>;
  }
}

const NotificationItem = React.memo(function NotificationItem({ notif, onMarkAsRead, fmtTime }: {
  notif: Notification;
  onMarkAsRead: (id: string) => void;
  fmtTime: (d: string) => string;
}) {
  return (
    <button type="button"
      onClick={() => !notif.read && onMarkAsRead(notif.id)}
      className={`w-full text-left px-4 py-3 border-b border-surface-2 hover:bg-surface-1 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
        !notif.read ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0 mt-0.5">{getNotificationIcon(notif.type)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {notif.title}
            </span>
            {!notif.read && (
              <span className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
            {notif.message}
          </p>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 block">
            {fmtTime(notif.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
});

export const NotificationBell = memo(function NotificationBell() {
  const { toast } = useToast();
  const t = useTranslations('common');
  const tRef = useRef(t); tRef.current = t;

  const fmtTime = useCallback((d: string) => formatRelativeTime(d, {
    just_now: tRef.current('just_now'),
    minutes_ago: tRef.current('minutes_ago'),
    hours_ago: tRef.current('hours_ago'),
    days_ago: tRef.current('days_ago'),
  } as const), []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const staleRef = useRef(false);
  const loadingRef = useRef(false);

  const loadNotifications = useCallback(async () => {
    if (loadingRef.current) return;
    // Skip if auth token not yet available (race on page load)
    if (!getAuthToken()) return;
    loadingRef.current = true;
    setLoadingNotifs(true);
    try {
      // One request: the list response carries `unread` (merged server-side)
      // — halves the poller's request volume.
      const notifRes = await api.get<{ items: Notification[]; unread?: number }>(
        '/api/notifications?per_page=20',
      );
      if (staleRef.current) return;
      if (notifRes.success && notifRes.data?.items) {
        setNotifications(notifRes.data.items);
      }
      if (notifRes.success && typeof notifRes.data?.unread === 'number') {
        setUnreadCount(notifRes.data.unread);
      }
    } catch (err) {
      if (staleRef.current) return;
      warn('Notifications: failed to load notifications', err);
      toast(tRef.current('notification_load_failed'), 'error');
    } finally {
      loadingRef.current = false;
      setLoadingNotifs(false);
    }
  }, [toast]);

  useEffect(() => {
    staleRef.current = false;
    // Delay initial load slightly to avoid racing with auth token setup
    // after registration or page navigation
    const timer = setTimeout(() => {
      loadNotifications();
    }, 500);
    // Poll only while the tab is visible — a backgrounded tab generated
    // thousands of idle requests during monitoring. Becoming visible again
    // refreshes immediately so the bell never shows stale data.
    const interval = setInterval(() => {
      if (!document.hidden) loadNotifications();
    }, 60000);
    const onVisible = () => {
      if (!document.hidden) loadNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      staleRef.current = true;
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  const markAsRead = useCallback(async (id: string) => {
    let prev: typeof notifications | undefined;
    let prevCount: number | undefined;
    setNotifications((ns) => {
      prev = ns;
      return ns.map((n) => (n.id === id ? { ...n, read: true } : n));
    });
    setUnreadCount((c) => {
      prevCount = c;
      return Math.max(0, c - 1);
    });
    try {
      const res = await api.patch(`/api/notifications/${id}/read`);
      if (staleRef.current) return;
      if (!res.success) {
        if (prev) setNotifications(prev);
        if (prevCount !== undefined) setUnreadCount(prevCount);
        warn('Notifications: mark read returned success=false', res.error);
        toast(tRef.current('notification_mark_read_failed'), 'error');
      }
    } catch (err) {
      if (staleRef.current) return;
      if (prev) setNotifications(prev);
      if (prevCount !== undefined) setUnreadCount(prevCount);
      warn('Notifications: failed to mark notification as read', err);
      toast(tRef.current('notification_mark_read_failed'), 'error');
    }
  }, [toast]);

  async function markAllRead() {
    let prev: typeof notifications | undefined;
    let prevCount: number | undefined;
    setNotifications((ns) => {
      prev = ns;
      return ns.map((n) => ({ ...n, read: true }));
    });
    setUnreadCount((c) => {
      prevCount = c;
      return 0;
    });
    setMarkingAll(true);
    try {
      const res = await api.post('/api/notifications/mark-all-read');
      if (staleRef.current) return;
      if (!res.success) {
        if (prev) setNotifications(prev);
        if (prevCount !== undefined) setUnreadCount(prevCount);
        warn('Notifications: mark all read returned success=false', res.error);
        toast(t('notification_mark_all_read_failed'), 'error');
      }
    } catch (err) {
      if (staleRef.current) return;
      if (prev) setNotifications(prev);
      if (prevCount !== undefined) setUnreadCount(prevCount);
      warn('Notifications: failed to mark all as read', err);
      toast(t('notification_mark_all_read_failed'), 'error');
    } finally {
      if (!staleRef.current) setMarkingAll(false);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button type="button"
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) loadNotifications(); }}
        className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-surface-1 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
        aria-label={t('notifications')}
        aria-expanded={isOpen}
        aria-controls="notification-dropdown"
      >
        <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id="notification-dropdown"
          tabIndex={-1}
          onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false); }}
          className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-surface-0 rounded-xl border border-surface-3 shadow-lg z-50 overflow-hidden animate-slide-down"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('notifications')}</h3>
            {unreadCount > 0 && (
              <button type="button"
                onClick={markAllRead}
                disabled={markingAll}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 min-h-[44px] inline-flex items-center px-2"
              >
                {t('notifications_mark_all_read')}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto" role="list" aria-label={t('notifications')}>
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {loadingNotifs ? t('loading') : t('notifications_no_notifications')}
              </div>
            ) : (
              notifications.map((notif) => (
                <NotificationItem
                  key={notif.id}
                  notif={notif}
                  onMarkAsRead={markAsRead}
                  fmtTime={fmtTime}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});
