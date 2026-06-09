'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';

interface UseExportShareLinkOptions {
 bookId: string;
 format: string;
 selectedTypes: Set<string>;
 selectedTag: string;
}

export function useExportShareLink({ bookId, format, selectedTypes, selectedTag }: UseExportShareLinkOptions) {
 const t = useTranslations('reader');
 const { toast } = useToast();
 const [shareLink, setShareLink] = useState<string | null>(null);
 const [sharing, setSharing] = useState(false);
 const mountedRef = useRef(true);
 useEffect(() => { return () => { mountedRef.current = false; }; }, []);

 const handleShareLink = async () => {
  setSharing(true);
  try {
   const body: Record<string, string> = { bookId, format };
   if (selectedTypes.size < 3) body.types = [...selectedTypes].join(',');
   if (selectedTag) body.tags = selectedTag;

   const res = await api.post<{ token: string; url: string; format: string; title: string }>(
    '/api/share/export',
    body,
   );

   if (!mountedRef.current) return;
   if (res.success && res.data) {
    const baseUrl = window.location.origin;
    const fullUrl = `${baseUrl}/api/share/s/${res.data.token}`;
    setShareLink(fullUrl);
    await navigator.clipboard.writeText(fullUrl);
    toast(t('export_link_copied_clipboard_msg'), 'success');
   } else {
    toast(t('export_failed_share_link'), 'error');
   }
  } catch (error) {
   console.warn('useExportShareLink: share failed', error);
   if (mountedRef.current) toast(t('export_failed_share_link'), 'error');
  } finally {
   if (mountedRef.current) setSharing(false);
  }
 };

 return { shareLink, sharing, handleShareLink };
}
