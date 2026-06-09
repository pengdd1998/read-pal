import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function generateMetadata() {
 const t = await getTranslations('privacy');
 return { title: t('page_title') };
}

export default async function PrivacyPage() {
 const t = await getTranslations('privacy');

 return (
 <div className="min-h-screen bg-surface-1">
  {/* Header */}
  <header className="bg-amber-800 dark:bg-amber-900 text-white">
  <div className="max-w-3xl mx-auto px-6 py-8">
   <Link href="/dashboard" className="text-amber-200 hover:text-white text-sm mb-2 min-h-[44px] inline-flex items-center">
   {t('back_to_dashboard')}
   </Link>
   <h1 className="text-3xl font-bold font-serif">{t('page_title')}</h1>
   <p className="text-amber-200 mt-2">{t('last_updated')}</p>
  </div>
  </header>

  <div className="max-w-4xl mx-auto px-6 py-10 space-y-10 text-gray-700 dark:text-gray-300 text-sm leading-relaxed">

  <section>
   <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s1_title')}</h2>
   <p>{t('s1_body')}</p>
   <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
   <li><strong>{t('s1_item1_label')}</strong> {t('s1_item1_text')}</li>
   <li><strong>{t('s1_item2_label')}</strong> {t('s1_item2_text')}</li>
   <li><strong>{t('s1_item3_label')}</strong> {t('s1_item3_text')}</li>
   <li><strong>{t('s1_item4_label')}</strong> {t('s1_item4_text')}</li>
   </ul>
  </section>

  <section>
   <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s2_title')}</h2>
   <p>{t('s2_body')}</p>
   <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
   <li>{t('s2_item1')}</li>
   <li>{t('s2_item2')}</li>
   <li>{t('s2_item3')}</li>
   <li>{t('s2_item4')}</li>
   </ul>
  </section>

  <section>
   <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s3_title')}</h2>
   <p>{t('s3_body')}</p>
  </section>

  <section>
   <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s4_title')}</h2>
   <p>{t('s4_body')}</p>
  </section>

  <section>
   <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s5_title')}</h2>
   <p>{t('s5_body')}</p>
  </section>

  <section>
   <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s6_title')}</h2>
   <p>{t('s6_body')}</p>
  </section>

  <section>
   <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s7_title')}</h2>
   <p>{t('s7_body')}</p>
  </section>

  <section>
   <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s8_title')}</h2>
   <p>{t('s8_body')}</p>
   <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
   <li><strong>{t('s8_item1_label')}</strong> {t('s8_item1_text')}</li>
   <li><strong>{t('s8_item2_label')}</strong> {t('s8_item2_text')}</li>
   <li><strong>{t('s8_item3_label')}</strong> {t('s8_item3_text')}</li>
   </ul>
  </section>

  <section>
   <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s9_title')}</h2>
   <p>{t('s9_body')}</p>
  </section>

  <section>
   <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s10_title')}</h2>
   <p>
   {t('s10_body_prefix')}{' '}
   <a
    href={t('s10_body_link_url')}
    target="_blank"
    rel="noopener noreferrer"
    className="text-amber-700 dark:text-amber-400 underline hover:text-amber-600"
   >
    {t('s10_body_link')}
   </a>
   .
   </p>
  </section>

  <div className="pt-6 border-t border-surface-3">
   <Link href="/" className="text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 text-sm font-medium min-h-[44px] inline-flex items-center">
   {t('back_to_home')}
   </Link>
  </div>
  </div>
 </div>
 );
}
