'use client';

import React from 'react';
import { Link } from '@/i18n/navigation';
import { usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { BOTTOM_NAV_ITEMS } from '@/lib/nav-config';
import { hapticLight } from '@/lib/haptics';

export const MobileBottomNav = React.memo(function MobileBottomNav() {
 const pathname = usePathname();
 const t = useTranslations('nav');

 const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

 return (
 <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-0/95 backdrop-blur-lg border-t border-surface-2 safe-area-bottom" aria-label={t("bottom_navigation")}>
  <div className="flex items-center justify-around">
  {BOTTOM_NAV_ITEMS.map((item) => {
   const active = isActive(item.href);
   return (
   <Link
    key={item.href}
    href={item.href}
    onClick={() => { if (!active) hapticLight(); }}
    aria-current={active ? 'page' : undefined}
    className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[48px] py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
    active
     ? 'text-amber-600 dark:text-amber-400'
     : 'text-gray-500 dark:text-gray-400'
    }`}
   >
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
    </svg>
    <span className="text-[10px] font-medium">{t(item.labelKey)}</span>
   </Link>
   );
  })}
  </div>
 </nav>
 );
});
