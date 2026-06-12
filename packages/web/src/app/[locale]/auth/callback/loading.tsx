import { getTranslations } from 'next-intl/server';

export default async function Loading() {
 const t = await getTranslations('common');
 return (
 <div className="min-h-[80vh] flex items-center justify-center animate-fade-in">
  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" role="status" aria-label={t('loading')} />
 </div>
 );
}
