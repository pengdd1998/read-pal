'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { authFetch } from '@/lib/auth-fetch';

interface BookHealth {
  book_id: string;
  title: string;
  chunks: number;
  status: string;
}

interface TraceStage {
  stage: string;
  latency_ms?: number;
  sql?: string | null;
  sql_params?: Record<string, string>;
  tokens?: string[];
  row_count?: number;
  results?: Array<{ title: string; similarity?: number; score?: number; content_preview?: string }>;
  dims?: number;
  succeeded?: boolean;
  vector_preview?: string | null;
  semantic_count?: number;
  keyword_count?: number;
  fused_count?: number;
  head_chapters?: string[];
  final_count?: number;
  format?: string;
  chars?: number;
  chunk_count?: number;
  system_prompt_head?: string;
  rag_context?: string;
  total_prompt_chars?: number;
  note?: string;
}

interface TraceData {
  query: string;
  stages: TraceStage[];
  total_latency_ms: number;
  final_results: Array<{ title: string; similarity: number; content: string }>;
}

const STAGE_LABELS: Record<string, string> = {
  query_embedding: 'stage_embedding',
  semantic_search: 'stage_semantic',
  keyword_search: 'stage_keyword',
  rrf_fusion: 'stage_rrf',
  chapter_coverage: 'stage_coverage',
  context_assembly: 'stage_context',
  llm_prompt_preview: 'stage_prompt',
};

function StageCard({ stage, t, idx }: { stage: TraceStage; t: (k: string) => string; idx: number }) {
  const [open, setOpen] = useState(idx < 2);
  const label = t(STAGE_LABELS[stage.stage] || stage.stage);
  return (
    <div className="border border-surface-3 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-surface-1 hover:bg-surface-2/50 text-left"
        aria-expanded={open}
      >
        <span className="w-6 h-6 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {idx + 1}
        </span>
        <span className="text-sm font-medium flex-1">{label}</span>
        {stage.latency_ms != null && (
          <span className="text-xs text-gray-400 tabular-nums">{stage.latency_ms}ms</span>
        )}
        {stage.row_count != null && (
          <span className="text-xs text-gray-400">{t('trace_rows')}: {stage.row_count}</span>
        )}
        <span className="text-gray-400 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 py-2 space-y-2 text-xs">
          {stage.note && <div className="text-amber-600">{stage.note}</div>}
          {stage.dims != null && (
            <div className="flex gap-4 text-gray-500">
              <span>{t('trace_dims')}: {stage.dims}</span>
              {stage.vector_preview && <code className="text-[10px] text-gray-400">{stage.vector_preview}</code>}
            </div>
          )}
          {stage.sql && (
            <div>
              <div className="text-[10px] uppercase text-gray-400 mb-1">{t('trace_sql')}</div>
              <pre className="bg-surface-2/70 rounded p-2 overflow-x-auto max-h-40 text-[10px] leading-relaxed font-mono whitespace-pre-wrap break-all">{stage.sql}</pre>
            </div>
          )}
          {stage.sql_params && Object.keys(stage.sql_params).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(stage.sql_params).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded bg-surface-1 border border-surface-3 text-[10px]">
                  {k}={v}
                </span>
              ))}
            </div>
          )}
          {stage.tokens && stage.tokens.length > 0 && (
            <div>
              <div className="text-[10px] uppercase text-gray-400 mb-1">{t('trace_tokens')}</div>
              <div className="flex flex-wrap gap-1">
                {stage.tokens.map((tok) => (
                  <span key={tok} className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/20 text-[10px] text-violet-700 dark:text-violet-300">{tok}</span>
                ))}
              </div>
            </div>
          )}
          {stage.semantic_count != null && (
            <div className="text-gray-500">semantic={stage.semantic_count} keyword={stage.keyword_count} fused={stage.fused_count}</div>
          )}
          {stage.head_chapters && (
            <div className="text-gray-500">chapters: {stage.head_chapters.join(', ')}</div>
          )}
          {stage.results && stage.results.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="text-left text-[10px] text-gray-400 border-b border-surface-3">
                  <th className="py-1 pr-2">{t('label')}</th>
                  <th className="py-1 pr-2">sim</th>
                  <th className="py-1">{t('content')}</th>
                </tr>
              </thead>
              <tbody>
                {stage.results.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b border-surface-3/30">
                    <td className="py-1 pr-2 font-medium whitespace-nowrap">{r.title}</td>
                    <td className="py-1 pr-2 tabular-nums text-gray-500">{r.similarity?.toFixed(3) ?? r.score ?? '—'}</td>
                    <td className="py-1 text-gray-500 truncate max-w-72">{r.content_preview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {stage.format && (
            <pre className="bg-surface-2/70 rounded p-2 overflow-x-auto max-h-60 text-[10px] leading-relaxed font-mono whitespace-pre-wrap">{stage.format}</pre>
          )}
          {stage.system_prompt_head && (
            <pre className="bg-surface-2/70 rounded p-2 overflow-x-auto max-h-40 text-[10px] leading-relaxed font-mono whitespace-pre-wrap">{stage.system_prompt_head}</pre>
          )}
          {stage.total_prompt_chars != null && (
            <div className="text-gray-500">total: {stage.total_prompt_chars.toLocaleString()} chars</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RagPage() {
  const t = useTranslations('opsLlm');
  const searchParams = useSearchParams() as ReturnType<typeof useSearchParams> | null;
  const [opsKey, setOpsKey] = useState('');
  const [books, setBooks] = useState<BookHealth[]>([]);
  const [zeroCount, setZeroCount] = useState(0);
  const [bookId, setBookId] = useState('');
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('ops-key');
    if (saved) setOpsKey(saved);
    // URL pre-fill from traces drill-through
    const rq = searchParams?.get('replay_query');
    const rb = searchParams?.get('book_id');
    if (rq) setQuery(rq);
    if (rb) setBookId(rb);
  }, [searchParams]);

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

  const runTrace = async () => {
    if (!opsKey || !bookId || !query.trim()) return;
    setLoading(true);
    setTrace(null);
    try {
      const res = await authFetch('/api/v1/stats/llm/rag/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ops-Key': opsKey },
        body: JSON.stringify({ book_id: bookId, query: query.trim(), top_k: topK }),
      });
      const body = await res.json();
      if (body?.data) setTrace(body.data);
    } catch { /* show error */ } finally { setLoading(false); }
  };

  // Auto-run when pre-filled from traces
  useEffect(() => {
    if (opsKey && bookId && query && !trace && !loading) runTrace();
  }, [opsKey, bookId, query]); // eslint-disable-line react-hooks/exhaustive-deps

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

      <div className="bg-surface-0 rounded-2xl border border-surface-3 overflow-hidden max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-0">
            <tr className="border-b border-surface-3 text-left text-xs text-gray-500">
              <th className="px-4 py-2.5">{t('rag_book')}</th>
              <th className="px-4 py-2.5">{t('rag_chunks')}</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {books.slice(0, 100).map((b) => (
              <tr key={b.book_id}
                onClick={() => setBookId(b.book_id)}
                className={`border-b border-surface-3/50 last:border-0 cursor-pointer hover:bg-surface-1 ${bookId === b.book_id ? 'bg-amber-50/50' : ''} ${b.chunks === 0 ? 'text-red-600' : ''}`}>
                <td className="px-4 py-2 font-medium truncate max-w-64">{b.title}</td>
                <td className="px-4 py-2 tabular-nums">{b.chunks}</td>
                <td className="px-4 py-2 text-xs">{b.chunks === 0 ? '⚠️ zero' : '✓'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5">
        <h2 className="text-sm font-semibold mb-3">{t('trace_title')}</h2>
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('rag_query')} data-testid="trace-query"
            className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-surface-3 bg-surface-1 text-sm" />
          <select value={topK} onChange={(e) => setTopK(Number(e.target.value))}
            className="px-2 py-2 rounded border border-surface-3 bg-surface-1 text-sm">
            {[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" onClick={runTrace} disabled={loading || !bookId || !query.trim()}
            data-testid="trace-run"
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium disabled:opacity-40">
            {loading ? '…' : t('trace_btn')}
          </button>
        </div>

        {trace && (
          <div className="space-y-3" data-testid="trace-result">
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>{t('trace_total')}: <strong className="text-gray-700 dark:text-gray-200">{trace.total_latency_ms}ms</strong></span>
              <span>{trace.stages.length} stages</span>
            </div>
            {trace.stages.map((stage, i) => (
              <StageCard key={stage.stage} stage={stage} t={t} idx={i} />
            ))}
          </div>
        )}
        {!trace && !loading && (
          <div className="text-xs text-gray-400">{t('rag_no_results')}</div>
        )}
      </div>
    </div>
  );
}
