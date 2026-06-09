'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

const languages = [
 { code: 'en', label: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
 { code: 'zh', label: '\u4E2D\u6587', flag: '\u{1F1E8}\u{1F1F3}' },
] as const;

export function LanguageSwitcher() {
 const locale = useLocale();
 const router = useRouter();
 const pathname = usePathname();
 const tc = useTranslations('common');

 function switchLocale(newLocale: string) {
 router.replace(pathname, { locale: newLocale });
 }

 return (
 <div className="flex items-center gap-1 rounded-lg border border-surface-3 p-0.5">
  {languages.map((lang) => (
  <button
   key={lang.code}
   onClick={() => switchLocale(lang.code)}
   className={`px-2.5 py-1 text-sm rounded-md transition-colors min-h-[44px] inline-flex items-center ${
   locale === lang.code
    ? 'bg-amber-600 text-white'
    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
   }`}
   aria-label={tc('switch_to_language', { language: lang.label })}
  >
   <span className="mr-1">{lang.flag}</span>
   {lang.label}
  </button>
  ))}
 </div>
 );
}
