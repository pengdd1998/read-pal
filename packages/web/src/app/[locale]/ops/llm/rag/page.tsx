'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { authFetch } from '@/lib/auth-fetch';

interface BookHealth {
  book_id: string;
  title: string;
  chunks: number;
  status: string;
}

interface ReplayResult {
  title: string;
  content: string;
  similarity: number;
}

export default function RagPage() {
  const t = useTranslations('opsLlm');
  const [opsKey, setOpsKey] = useState('');
  const [books, setBooks] = useState<BookHealth[]>([]);
  const [zeroCount, setZeroCount] = useState(0);
  const [bookId, setBookId] = useState('');
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [results, setResults] = useState<ReplayResult[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('ops-key');
    if (saved) setOpsKey(saved);
  }, []);

  const loadBooks = useCallback(async () => {
    if (!opsKey) return;
    try {
      const res = await authFetch('/api/v1/stats/llm/rag/books', { headers: { 'X-Ops-Key': opsKey } });
      const body = await res.json();
      if (body?.data) {
        setBooks(body.data.books ?? []);
        setZeroCount(body.data.zero_chunk_books ?? 0);
      }
    } catch { /* best-effort */ }
  }, [opsKey]);

  useEffect(() => { loadBooks(); }, [loadBooks]);

  const replay = async () => {
    if (!opsKey || !bookId || !query.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const res = await authFetch('/api/v1/stats/llm/rag/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ops-Key': opsKey },
        body: JSON.stringify({ book_id: bookId, query: query.trim(), top_k: topK }),
      });
      const body = await res.json();
      if (body?.data) {
        setResults(body.data.results ?? []);
        setLatency(body.data.latency_ms);
      }
    } catch { /* show error */ } finally { setLoading(false); }
  };

  if (!opsKey) {
    return (
      <div className="container-content px-4 py-16 max-w-md mx-auto text-center">
        <div className="text-4xl mb-4">🔐</div>
        <input type="password" value={opsKey} onChange={(e) => setOpsKey(e.target.value)}
          placeholder={t('key_placeholder')} className="w-full px-4 py-2.5 rounded-xl border border-surface-3 bg-surface-1" />
      </div>
    );
  }

  return (
    <div className="container-content px-4 sm:px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold">📊 {t('rag_health')}</h1>

      {zeroCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
          ⚠️ {zeroCount} {t('rag_zero_chunk')}
        </div>
      )}

      <div className="bg-surface-0 rounded-2xl border border-surface-3 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-3 text-left text-xs text-gray-500">
              <th className="px-4 py-2.5">{t('rag_book')}</th>
              <th className="px-4 py-2.5">{t('rag_chunks')}</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {books.slice(0, 50).map((b) => (
              <tr key={b.book_id}
                onClick={() => setBookId(b.book_id)}
                className={`border-b border-surface-3/50 last:border-0 cursor-pointer hover:bg-surface-1 ${bookId === b.book_id ? 'bg-amber-50/50' : ''} ${b.chunks === 0 ? 'text-red-600' : ''}`}>
                <td className="px-4 py-2.5 font-medium truncate max-w-64">{b.title}</td>
                <td className="px-4 py-2.5 tabular-nums">{b.chunks}</td>
                <td className="px-4 py-2.5 text-xs">{b.chunks === 0 ? '⚠️ zero' : '✓'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5">
        <h2 className="text-sm font-semibold mb-3">{t('rag_replay')}</h2>
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('rag_query')}
            className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-surface-3 bg-surface-1 text-sm" />
          <select value={topK} onChange={(e) => setTopK(Number(e.target.value))}
            className="px-2 py-2 rounded border border-surface-3 bg-surface-1 text-sm">
            {[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" onClick={replay} disabled={loading || !bookId || !query.trim()}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium disabled:opacity-40">
            {loading ? '…' : t('rag_replay_btn')}
          </button>
        </div>
        {latency != null && <div className="text-xs text-gray-400 mb-2">{t('rag_latency')}: {latency}ms</div>}
        {results.length > 0 ? (
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="rounded-lg bg-surface-1 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-gray-400 tabular-nums">sim={r.similarity.toFixed(3)}</span>
                </div>
                <div className="text-gray-500 line-clamp-2">{r.content.slice(0, 200)}</div>
              </div>
            ))}
          </div>
        ) : !loading && (
          <div className="text-xs text-gray-400">{t('rag_no_results')}</div>
        )}
      </div>
    </div>
  );
}
