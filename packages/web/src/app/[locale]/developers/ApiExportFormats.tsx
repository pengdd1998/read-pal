'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

export const ApiExportFormats = React.memo(function ApiExportFormats() {
 const t = useTranslations('developers');

 return (
 <section>
  <h2 className="text-xl font-bold font-serif text-gray-900 mb-4">{t('export_formats')}</h2>
  <div className="bg-surface-0 rounded-xl border border-surface-3 p-6 text-sm text-gray-700 overflow-x-auto">
  <table className="w-full text-left">
   <thead>
   <tr className="border-b border-surface-3">
    <th className="pb-2 font-semibold">{t('export_format')}</th>
    <th className="pb-2 font-semibold">{t('export_type')}</th>
    <th className="pb-2 font-semibold">{t('export_use_case')}</th>
   </tr>
   </thead>
   <tbody className="divide-y divide-gray-200">
   <tr><td className="py-2 font-mono">csv</td><td>text/csv</td><td>{t('export_csv_use')}</td></tr>
   <tr><td className="py-2 font-mono">json</td><td>application/json</td><td>{t('export_json_use')}</td></tr>
   <tr><td className="py-2 font-mono">bibtex</td><td>application/x-bibtex</td><td>{t('export_bibtex_use')}</td></tr>
   <tr><td className="py-2 font-mono">apa</td><td>text/plain</td><td>{t('export_apa_use')}</td></tr>
   <tr><td className="py-2 font-mono">mla</td><td>text/plain</td><td>{t('export_mla_use')}</td></tr>
   <tr><td className="py-2 font-mono">chicago</td><td>text/plain</td><td>{t('export_chicago_use')}</td></tr>
   <tr><td className="py-2 font-mono">research</td><td>text/markdown</td><td>{t('export_research_use')}</td></tr>
   <tr><td className="py-2 font-mono">annotated_bib</td><td>text/markdown</td><td>{t('export_annotated_use')}</td></tr>
   <tr><td className="py-2 font-mono">study_guide</td><td>text/markdown</td><td>{t('export_study_use')}</td></tr>
   <tr><td className="py-2 font-mono">bookclub</td><td>text/markdown</td><td>{t('export_bookclub_use')}</td></tr>
   </tbody>
  </table>
  </div>
 </section>
 );
});
