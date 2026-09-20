'use client';

import React, { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { randomIdempotencyKey } from '@read-pal/shared';
import { API_BASE_URL, api } from '@/lib/api/client';
import { authFetchWithRefresh } from '@/lib/auth-fetch';
import { warn } from '@/lib/logger';
import { consumeSSEStream } from '@/lib/sse';
import { Link } from '@/i18n/navigation';

interface ResearchSource {
  source_id: number;
  book_id: string | null;
  book_title: string;
  author: string;
  chapter_title: string;
}

interface ResearchFinding {
  claim: string;
  evidence: string;
  source_id: number;
  book_title: string;
  chapter_title: string;
}

interface ResearchBrief {
  summary: string;
  findings: ResearchFinding[];
  follow_ups: string[];
  sources: ResearchSource[];
  books_searched?: number;
  error?: string;
}

type Phase = 'idle' | 'searching' | 'sources' | 'synthesizing' | 'done' | 'error';

const MAX_QUESTION = 2000;

/**
 * Research agent entry (matrix J1/J2): cross-library Q&A with citations,
 * wired to the phase-streamed POST /api/v1/agents/research/stream SSE
 * endpoint. Citations render as soon as RAG lands (sources phase), the
 * brief replaces them when synthesis completes, and the in-flight stream
 * is cancellable via the shared /chat/cancel registry. The backend owns
 * sanitization and the RAG spoiler boundary; this panel only renders.
 */
export const ResearchPanel = React.memo(function ResearchPanel() {
  const t = useTranslations('dashboard');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [streamSources, setStreamSources] = useState<ResearchSource[]>([]);
  const [brief, setBrief] = useState<ResearchBrief | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<string | null>(null);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const submit = async (q?: string) => {
    const query = (q ?? question).trim();
    if (query.length < 2 || loading) return;
    setLoading(true);
    setBrief(null);
    setStreamSources([]);
    setPhase('searching');
    requestIdRef.current = null;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await authFetchWithRefresh(`${API_BASE_URL}/api/v1/agents/research/stream`, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ question: query }),
        headers: { 'Idempotency-Key': randomIdempotencyKey() },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      consumeSSEStream(
        response,
        () => {},
        () => {
          if (mountedRef.current) { setLoading(false); abortRef.current = null; }
        },
        () => {
          if (!mountedRef.current) return;
          setLoading(false);
          abortRef.current = null;
          setPhase('error');
          setBrief({ summary: '', findings: [], follow_ups: [], sources: [], error: t('research_error') });
        },
        controller.signal,
        (meta) => {
          if (!mountedRef.current) return;
          if (meta.request_id) requestIdRef.current = meta.request_id;
          if (meta.phase) setPhase(meta.phase);
          if (meta.sources) setStreamSources(meta.sources as ResearchSource[]);
          if (meta.brief) {
            setBrief(meta.brief as unknown as ResearchBrief);
            setPhase('done');
          }
          if (meta.cancelled) setLoading(false);
        },
      );
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      warn('ResearchPanel: stream failed', err);
      if (mountedRef.current) {
        setLoading(false);
        abortRef.current = null;
        setPhase('error');
        setBrief({ summary: '', findings: [], follow_ups: [], sources: [], error: t('research_error') });
      }
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    const rid = requestIdRef.current;
    requestIdRef.current = null;
    setLoading(false);
    setPhase('idle');
    setStreamSources([]);
    if (rid) api.post('/api/v1/agents/chat/cancel', { request_id: rid }).catch(() => {});
  };

  const sourceById = (id: number) => brief?.sources.find((s) => s.source_id === id);

  return (
    <section className="mt-10 pt-6 border-t border-surface-2 animate-fade-in" aria-label={t('research_title')}>
      <div className="flex items-center gap-2 mb-1">
        <svg aria-hidden="true" className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 104v5.714a2.25 2.25 0 00.659 1.591L5 19.5m0-5h14m0 0v5m0-5a2.25 2.25 0 00-.659-1.591L14.5 10.419a2.25 2.25 0 01-.659-1.591V3.104M9.75 3.104h4.5" />
        </svg>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('research_title')}</h2>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('research_desc')}</p>

      <div className="flex gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION))}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
          placeholder={t('research_placeholder')}
          rows={2}
          maxLength={MAX_QUESTION}
          aria-label={t('research_placeholder')}
          className="flex-1 resize-none rounded-xl border border-surface-3 bg-surface-0 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => (loading ? cancel() : void submit())}
          disabled={!loading && question.trim().length < 2}
          className="self-end px-4 h-9 rounded-xl bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
          data-testid={loading ? 'research-cancel' : 'research-submit'}
        >
          {loading ? t('research_cancel') : t('research_submit')}
        </button>
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400" role="status">
          <span className="inline-block w-3 h-3 border-2 border-primary-400/60 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          {phase === 'searching' ? t('research_phase_searching') : t('research_phase_synthesizing')}
        </div>
      )}

      {loading && streamSources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="research-progress-sources">
          {streamSources.map((s) => (
            <span key={s.source_id} className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-surface-1 border border-surface-3 text-[11px] text-gray-600 dark:text-gray-300">
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-mono">{s.source_id}</span>
              {s.book_title}
            </span>
          ))}
        </div>
      )}

      {brief?.error && !brief.sources.length && (
        <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-4 py-3 text-xs text-amber-700 dark:text-amber-300" role="alert">
          {brief.error}
        </div>
      )}

      {brief && !brief.sources.length && !brief.error && (
        <div className="mt-4 rounded-xl bg-surface-1 px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
          {t('research_empty_library')}{' '}
          <Link href="/library" className="text-primary-600 dark:text-primary-400 hover:underline">{t('research_go_library')}</Link>
        </div>
      )}

      {brief && brief.sources.length > 0 && (
        <div className="mt-4 space-y-4" data-testid="research-brief">
          {brief.error && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-300" role="alert">
              {brief.error}
            </div>
          )}
          {brief.summary && (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{brief.summary}</p>
          )}

          {brief.findings.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">{t('research_findings')}</p>
              <ol className="space-y-2">
                {brief.findings.map((f, i) => {
                  const src = sourceById(f.source_id);
                  return (
                    <li key={i} className="rounded-xl bg-surface-1 px-3 py-2.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{f.claim}</p>
                      {f.evidence && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{f.evidence}</p>}
                      {src?.book_id ? (
                        <Link
                          href={`/read/${src.book_id}`}
                          className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-mono">
                            {src.source_id}
                          </span>
                          {src.book_title} · {src.chapter_title}
                        </Link>
                      ) : src ? (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-gray-400">
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-surface-2 font-mono">{src.source_id}</span>
                          {src.book_title} · {src.chapter_title}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {brief.follow_ups.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">{t('research_follow_ups')}</p>
              <div className="flex flex-wrap gap-2">
                {brief.follow_ups.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={loading}
                    onClick={() => { setQuestion(q); void submit(q); }}
                    className="px-3 h-8 rounded-full bg-surface-1 border border-surface-3 text-xs text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-40 transition-colors focus-visible:ring-2 focus-visible:ring-primary-400"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {t('research_sources_count', { count: brief.sources.length })}
            {typeof brief.books_searched === 'number' && brief.books_searched > 0 ? ` · ${t('research_books_searched', { count: brief.books_searched })}` : ''}
          </p>
        </div>
      )}
    </section>
  );
});
