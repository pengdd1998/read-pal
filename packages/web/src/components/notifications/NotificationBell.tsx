'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/date';

interface Notification {
 id: string;
 type: string;
 title: string;
 message: string;
 read: boolean;
 createdAt: string;
 metadata?: Record<string, unknown>;
}

function getNotificationIcon(type: string) {
 switch (type) {
 case 'reading_reminder': return '📖';
 case 'streak_at_risk':
 case 'streak_milestone': return '🔥';
 case 'goal_achieved': return '🎯';
 case 'system': return '🔔';
 default: return '📬';
 }
}

export function NotificationBell() {
 const t = useTranslations('common');

 const fmtTime = (d: string) => formatRelativeTime(d, {
 just_now: t('just_now'),
 minutes_ago: t('minutes_ago'),
 hours_ago: t('hours_ago'),
 days_ago: t('days_ago'),
 } as const);
 const [notifications, setNotifications] = useState<Notification[]>([]);
 const [unreadCount, setUnreadCount] = useState(0);
 const [isOpen, setIsOpen] = useState(false);
 const [markingAll, setMarkingAll] = useState(false);
 const [loadingNotifs, setLoadingNotifs] = useState(false);
 const dropdownRef = useRef<HTMLDivElement>(null);
 const staleRef = useRef(false);
 const loadingRef = useRef(false);

 useEffect(() => {
 staleRef.current = false;
 // Delay initial load slightly to avoid racing with auth token setup
 // after registration or page navigation
 const timer = setTimeout(() => {
  loadNotifications();
 }, 500);
 const interval = setInterval(loadNotifications, 60000); // Poll every minute
 return () => {
  staleRef.current = true;
  clearTimeout(timer);
  clearInterval(interval);
 };
 }, []);

 useEffect(() => {
 function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
  setIsOpen(false);
  }
 }
 document.addEventListener('mousedown', handleClickOutside);
 return () => document.removeEventListener('mousedown', handleClickOutside);
 }, []);

 async function loadNotifications() {
 if (loadingRef.current) return;
 loadingRef.current = true;
 setLoadingNotifs(true);
 try {
  const [notifRes, countRes] = await Promise.all([
  api.get<{ items: Notification[] }>('/api/notifications?per_page=20'),
  api.get<number>('/api/notifications/unread-count'),
  ]);
  if (staleRef.current) return;
  if (notifRes.success && notifRes.data?.items) {
  setNotifications(notifRes.data.items);
  }
  if (countRes.success && typeof countRes.data === 'number') {
  setUnreadCount(countRes.data);
  }
 } catch (err) {
  if (staleRef.current) return;
  console.warn('Notifications: failed to load notifications', err);
 } finally {
  loadingRef.current = false;
  setLoadingNotifs(false);
 }
 }

 async function markAsRead(id: string) {
 const prev = notifications;
 const prevCount = unreadCount;
 setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)));
 setUnreadCount((c) => Math.max(0, c - 1));
 try {
  await api.patch(`/api/notifications/${id}/read`);
 } catch (err) {
  setNotifications(prev);
  setUnreadCount(prevCount);
  console.warn('Notifications: failed to mark notification as read', err);
 }
 }

 async function markAllRead() {
 const prev = notifications;
 const prevCount = unreadCount;
 setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
 setUnreadCount(0);
 setMarkingAll(true);
 try {
  await api.post('/api/notifications/mark-all-read');
 } catch (err) {
  setNotifications(prev);
  setUnreadCount(prevCount);
  console.warn('Notifications: failed to mark all as read', err);
 } finally {
  setMarkingAll(false);
 }
 }

 return (
 <div className="relative" ref={dropdownRef}>
  <button
  onClick={() => { setIsOpen(!isOpen); if (!isOpen) loadNotifications(); }}
  className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
  aria-label={t('notifications')}
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
  <div className="absolute right-0 top-full mt-2 w-80 bg-surface-0 rounded-xl border border-surface-3 shadow-lg z-50 overflow-hidden">
   <div className="flex items-center justify-between px-4 py-3 border-b border-surface-2">
   <h3 className="text-sm font-semibold text-gray-900">{t('notifications')}</h3>
   {unreadCount > 0 && (
    <button
    onClick={markAllRead}
    disabled={markingAll}
    className="text-xs text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
    >
    {t('notifications_mark_all_read')}
    </button>
   )}
   </div>

   <div className="max-h-80 overflow-y-auto">
   {notifications.length === 0 ? (
    <div className="p-6 text-center text-sm text-gray-400">
    {loadingNotifs ? 'Loading...' : t('notifications_no_notifications')}
    </div>
   ) : (
    notifications.map((notif) => (
    <button
     key={notif.id}
     onClick={() => !notif.read && markAsRead(notif.id)}
     className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
     !notif.read ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''
     }`}
    >
     <div className="flex items-start gap-3">
     <span className="text-lg flex-shrink-0 mt-0.5">{getNotificationIcon(notif.type)}</span>
     <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-900 truncate">
       {notif.title}
      </span>
      {!notif.read && (
       <span className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0" />
      )}
      </div>
      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
      {notif.message}
      </p>
      <span className="text-[10px] text-gray-400 mt-1 block">
      {fmtTime(notif.createdAt)}
      </span>
     </div>
     </div>
    </button>
    ))
   )}
   </div>
  </div>
  )}
 </div>
 );
}
