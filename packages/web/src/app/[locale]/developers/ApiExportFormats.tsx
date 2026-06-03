'use client';

import { useTranslations } from 'next-intl';

export function ApiExportFormats() {
  const t = useTranslations('developers');

  return (
    <section>
      <h2 className="text-xl font-bold font-serif text-stone-900 dark:text-stone-100 mb-4">{t('export_formats')}</h2>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-stone-200 dark:border-gray-700 p-6 text-sm text-stone-700 dark:text-stone-300 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-stone-200 dark:border-gray-700">
              <th className="pb-2 font-semibold">{t('export_format')}</th>
              <th className="pb-2 font-semibold">{t('export_type')}</th>
              <th className="pb-2 font-semibold">{t('export_use_case')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-gray-800">
            <tr><td className="py-2 font-mono">csv</td><td>text/csv</td><td>Data analysis (pandas, Excel, R)</td></tr>
            <tr><td className="py-2 font-mono">json</td><td>application/json</td><td>Full data portability / backup</td></tr>
            <tr><td className="py-2 font-mono">bibtex</td><td>application/x-bibtex</td><td>LaTeX bibliographies</td></tr>
            <tr><td className="py-2 font-mono">apa</td><td>text/plain</td><td>APA 7th citations</td></tr>
            <tr><td className="py-2 font-mono">mla</td><td>text/plain</td><td>MLA 9th citations</td></tr>
            <tr><td className="py-2 font-mono">chicago</td><td>text/plain</td><td>Chicago citations</td></tr>
            <tr><td className="py-2 font-mono">research</td><td>text/markdown</td><td>Tagged research notes</td></tr>
            <tr><td className="py-2 font-mono">annotated_bib</td><td>text/markdown</td><td>Per-passage citations with notes</td></tr>
            <tr><td className="py-2 font-mono">study_guide</td><td>text/markdown</td><td>Flashcards + outline for review</td></tr>
            <tr><td className="py-2 font-mono">bookclub</td><td>text/markdown</td><td>Discussion guide with AI questions</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
