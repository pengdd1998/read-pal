'use client';

import { useTranslations } from 'next-intl';

interface SidebarBackdropProps {
 visible: boolean;
 onClose: () => void;
}

export function SidebarBackdrop({ visible, onClose }: SidebarBackdropProps) {
 const t = useTranslations('reader');

 if (!visible) return null;

 return (
 <div
  className="fixed inset-0 bg-black/30 animate-fade-in z-30"
  onClick={onClose}
  onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
  tabIndex={-1}
  role="button"
  aria-label={t('sidebar_close_annotations')}
 />
 );
}
