'use client';

import { useTranslations } from 'next-intl';

export function ApiCodeExamples() {
 const t = useTranslations('developers');

 return (
 <section>
  <h2 className="text-xl font-bold font-serif text-gray-900 dark:text-gray-100 mb-4">{t('code_examples')}</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div className="bg-surface-0 rounded-xl border border-surface-3 p-4">
   <h3 className="font-semibold text-gray-800 mb-2">{t('code_python')}</h3>
   <div className="bg-stone-900 rounded-lg p-3 font-mono text-xs overflow-x-auto">
   <div className="text-stone-400">{'import requests'}</div>
   <div className="text-stone-400">{"API = 'https://your-readpal-instance.com'"}</div>
   <div className="text-stone-400">{'KEY = "rpk_YOUR_KEY"'}</div>
   <div className="text-stone-400">{'h = {"Authorization": f"Bearer {KEY}"}'}</div>
   <div className="text-stone-400 mt-1">{'# Get all books'}</div>
   <div className="text-green-400">{'books = requests.get(f"{API}/api/books", headers=h).json()'}</div>
   <div className="text-stone-400 mt-1">{'# Export annotations as CSV'}</div>
   <div className="text-green-400">{'csv = requests.get(f"{API}/api/export/csv", headers=h)'}</div>
   <div className="text-green-400">{'with open("annotations.csv", "w") as f:'}</div>
   <div className="text-green-400">{' f.write(csv.text)'}</div>
   </div>
  </div>
  <div className="bg-surface-0 rounded-xl border border-surface-3 p-4">
   <h3 className="font-semibold text-gray-800 mb-2">{t('code_javascript')}</h3>
   <div className="bg-stone-900 rounded-lg p-3 font-mono text-xs overflow-x-auto">
   <div className="text-stone-400">{"const API = 'https://your-readpal-instance.com';"}</div>
   <div className="text-stone-400">{'const KEY = "rpk_YOUR_KEY";'}</div>
   <div className="text-stone-400 mt-1">{'// List books'}</div>
   <div className="text-green-400">{'const res = await fetch(`${API}/api/books`, {'}</div>
   <div className="text-green-400">{' headers: { Authorization: `Bearer ${KEY}` }'}</div>
   <div className="text-green-400">{'});'}</div>
   <div className="text-green-400">{'const { data } = await res.json();'}</div>
   <div className="text-stone-400 mt-1">{'// Get reading stats'}</div>
   <div className="text-green-400">{'const stats = await fetch(`${API}/api/stats/dashboard`, {'}</div>
   <div className="text-green-400">{' headers: { Authorization: `Bearer ${KEY}` }'}</div>
   <div className="text-green-400">{'}).then(r => r.json());'}</div>
   </div>
  </div>
  </div>
 </section>
 );
}
