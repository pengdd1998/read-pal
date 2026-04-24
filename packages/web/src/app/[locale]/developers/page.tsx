'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api, API_BASE_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/hooks/usePageTitle';

// ---------------------------------------------------------------------------
// Endpoint data
// ---------------------------------------------------------------------------

interface Endpoint {
  method: string;
  path: string;
  description: string;
  auth: boolean;
}

const endpoints: Endpoint[] = [
  // Auth
  { method: 'POST', path: '/api/auth/register', description: 'Create account', auth: false },
  { method: 'POST', path: '/api/auth/login', description: 'Login (returns JWT)', auth: false },
  { method: 'POST', path: '/api/auth/forgot-password', description: 'Request password reset', auth: false },

  // Books
  { method: 'GET', path: '/api/books', description: 'List books (paginated)', auth: true },
  { method: 'POST', path: '/api/books', description: 'Add a book', auth: true },
  { method: 'GET', path: '/api/books/:id', description: 'Get book details', auth: true },
  { method: 'PATCH', path: '/api/books/:id', description: 'Update book', auth: true },
  { method: 'DELETE', path: '/api/books/:id', description: 'Delete book', auth: true },

  // Annotations
  { method: 'GET', path: '/api/annotations?bookId=', description: 'List annotations for a book', auth: true },
  { method: 'POST', path: '/api/annotations', description: 'Create annotation', auth: true },
  { method: 'DELETE', path: '/api/annotations/:id', description: 'Delete annotation', auth: true },
  { method: 'GET', path: '/api/v1/export/:bookId/:format', description: 'Export annotations (markdown, csv, bibtex, apa, etc.)', auth: true },

  // Reading Sessions
  { method: 'POST', path: '/api/reading-sessions', description: 'Start reading session', auth: true },
  { method: 'PATCH', path: '/api/reading-sessions/:id', description: 'End reading session', auth: true },
  { method: 'GET', path: '/api/reading-sessions?bookId=', description: 'List sessions for a book', auth: true },

  // Stats
  { method: 'GET', path: '/api/stats/dashboard', description: 'Dashboard stats overview', auth: true },
  { method: 'GET', path: '/api/stats/reading-calendar', description: '30-day reading activity', auth: true },
  { method: 'GET', path: '/api/stats/reading-speed', description: 'WPM + 7-day trend', auth: true },
  { method: 'GET', path: '/api/stats/reading-speed/by-book', description: 'Per-book speed comparison', auth: true },

  // Export
  { method: 'GET', path: '/api/export', description: 'Full data export (JSON)', auth: true },
  { method: 'GET', path: '/api/export/csv?type=annotations|books|sessions', description: 'CSV export for data analysis', auth: true },

  // Flashcards
  { method: 'GET', path: '/api/flashcards?bookId=', description: 'List flashcards for a book', auth: true },
  { method: 'POST', path: '/api/flashcards', description: 'Create flashcard', auth: true },
  { method: 'POST', path: '/api/flashcards/:id/review', description: 'Submit SM-2 review result', auth: true },

  // API Keys
  { method: 'GET', path: '/api/api-keys', description: 'List your API keys (masked)', auth: true },
  { method: 'POST', path: '/api/api-keys', description: 'Create new API key', auth: true },
  { method: 'DELETE', path: '/api/api-keys/:id', description: 'Revoke API key', auth: true },

  // Webhooks
  { method: 'GET', path: '/api/webhooks', description: 'List your webhooks', auth: true },
  { method: 'POST', path: '/api/webhooks', description: 'Create webhook', auth: true },
  { method: 'PATCH', path: '/api/webhooks/:id', description: 'Update webhook', auth: true },
  { method: 'DELETE', path: '/api/webhooks/:id', description: 'Delete webhook', auth: true },
  { method: 'POST', path: '/api/webhooks/:id/test', description: 'Send test ping', auth: true },
  { method: 'GET', path: '/api/webhooks/events', description: 'List available event types', auth: true },

  // AI Companion
  { method: 'POST', path: '/api/agents/chat', description: 'Chat with AI companion', auth: true },
];

// ---------------------------------------------------------------------------
// Method color helper
// ---------------------------------------------------------------------------

function methodColor(method: string): string {
  switch (method) {
    case 'GET': return 'bg-emerald-100 text-emerald-800';
    case 'POST': return 'bg-blue-100 text-blue-800';
    case 'PATCH': return 'bg-amber-100 text-amber-800';
    case 'DELETE': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DevelopersPage() {
  const t = useTranslations('developers');
  usePageTitle(t('page_title'));
  const { user } = useAuth();
  const [filter, setFilter] = useState('');
  const [apiKeyHint, setApiKeyHint] = useState<string | null>(null);

  useEffect(() => {
    // Check if user has API keys
    if (user) {
      api.get<Array<{ keyPrefix: string }>>('/api/api-keys')
        .then((res) => {
          const keys = res.data;
          if (keys && keys.length > 0) {
            setApiKeyHint(keys[0].keyPrefix + '...');
          }
        })
        .catch(() => { /* not authenticated or no keys */ });
    }
  }, [user]);

  const filtered = filter
    ? endpoints.filter((e) =>
        e.path.toLowerCase().includes(filter.toLowerCase()) ||
        e.description.toLowerCase().includes(filter.toLowerCase())
      )
    : endpoints;

  const apiBase = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-amber-800 text-white">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Link href="/dashboard" className="text-amber-200 hover:text-white text-sm mb-2 inline-block">
            {t('back_dashboard')}
          </Link>
          <h1 className="text-3xl font-bold font-serif">{t('header_title')}</h1>
          <p className="text-amber-200 mt-2">
            {t('header_subtitle')}
          </p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Quick Start */}
        <section>
          <h2 className="text-xl font-bold font-serif text-stone-900 mb-4">{t('quick_start')}</h2>
          <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-stone-800 mb-2">{t('step1_title')}</h3>
              <p className="text-sm text-stone-600">
                {t('step1_desc', {
                  link: t('step1_link'),
                  code: 'rpk_',
                })}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-stone-800 mb-2">{t('step2_title')}</h3>
              <div className="bg-stone-900 rounded-lg p-4 text-sm font-mono overflow-x-auto">
                <div className="text-stone-400 mb-1">{t('step2_comment')}</div>
                <div className="text-green-400">
                  curl -H &quot;Authorization: Bearer rpk_YOUR_KEY&quot; \
                </div>
                <div className="text-green-400 ml-6">
                  {apiBase}/api/books
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-stone-800 mb-2">{t('step3_title')}</h3>
              <div className="bg-stone-900 rounded-lg p-4 text-sm font-mono overflow-x-auto">
                <div className="text-stone-400 mb-1">{t('step3_comment')}</div>
                <div className="text-green-400">
                  curl -H &quot;Authorization: Bearer rpk_YOUR_KEY&quot; \
                </div>
                <div className="text-green-400 ml-6">
                  {apiBase}/api/export/csv?type=annotations &gt; annotations.csv
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Authentication */}
        <section>
          <h2 className="text-xl font-bold font-serif text-stone-900 mb-4">{t('authentication')}</h2>
          <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-3 text-sm text-stone-700">
            <p>{t('auth_intro', { code: 'Authorization' })}</p>
            <p><strong>{t('auth_methods')}</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>{t('auth_jwt', { code: '/api/auth/login', code2: 'Bearer eyJ...' })}</strong></li>
              <li><strong>{t('auth_api_key', { code: 'Bearer rpk_...' })}</strong></li>
            </ul>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <strong>{t('auth_tip')}</strong>
            </div>
          </div>
        </section>

        {/* Rate Limits */}
        <section>
          <h2 className="text-xl font-bold font-serif text-stone-900 mb-4">{t('rate_limits')}</h2>
          <div className="bg-white rounded-xl border border-stone-200 p-6 text-sm text-stone-700 space-y-3">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="pb-2 font-semibold">{t('rate_group')}</th>
                  <th className="pb-2 font-semibold">{t('rate_limit')}</th>
                  <th className="pb-2 font-semibold">{t('rate_window')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                <tr><td className="py-2">{t('rate_ai_chat')}</td><td>10</td><td>{t('rate_minute')}</td></tr>
                <tr><td className="py-2">{t('rate_data_export')}</td><td>5</td><td>{t('rate_minute')}</td></tr>
                <tr><td className="py-2">{t('rate_zotero')}</td><td>5</td><td>{t('rate_minute')}</td></tr>
                <tr><td className="py-2">{t('rate_zotero_batch')}</td><td>2</td><td>{t('rate_5_minutes')}</td></tr>
              </tbody>
            </table>
            <p>{t('rate_headers_intro')}</p>
            <div className="bg-stone-100 rounded-lg p-3 font-mono text-xs">
              <div>X-RateLimit-Limit: 10</div>
              <div>X-RateLimit-Remaining: 7</div>
              <div>X-RateLimit-Reset: 1713456789</div>
              <div>Retry-After: 45 &nbsp;# only on 429 responses</div>
            </div>
          </div>
        </section>

        {/* Response Format */}
        <section>
          <h2 className="text-xl font-bold font-serif text-stone-900 mb-4">{t('response_format')}</h2>
          <div className="bg-white rounded-xl border border-stone-200 p-6 text-sm text-stone-700 space-y-3">
            <p>{t('response_intro')}</p>
            <div className="bg-stone-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
              <div className="text-stone-400">{t('response_comment_success')}</div>
              <div className="text-green-400">{`{ "success": true, "data": { ... } }`}</div>
              <div className="text-stone-400 mt-2">{t('response_comment_error')}</div>
              <div className="text-red-400">{`{ "success": false, "error": { "code": "ERROR_CODE", "message": "Description" } }`}</div>
            </div>
            <p>{t('response_pagination', { code: 'pagination', code2: 'total', code3: 'page', code4: 'pageSize', code5: 'totalPages' })}</p>
          </div>
        </section>

        {/* Endpoints Reference */}
        <section>
          <h2 className="text-xl font-bold font-serif text-stone-900 mb-4">{t('endpoints_title')}</h2>

          <input
            type="text"
            placeholder={t('endpoints_filter')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-4 py-2 border border-stone-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
            {filtered.length === 0 && (
              <div className="p-4 text-sm text-stone-500 text-center">{t('endpoints_no_match')}</div>
            )}
            {filtered.map((ep, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-stone-50">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${methodColor(ep.method)}`}>
                  {ep.method}
                </span>
                <code className="text-sm font-mono text-stone-800 flex-1">{ep.path}</code>
                <span className="text-xs text-stone-500">{ep.description}</span>
                {ep.auth && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{t('endpoints_auth_badge')}</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-400 mt-2">{t('endpoints_count', { count: filtered.length })}</p>
        </section>

        {/* Export Formats */}
        <section>
          <h2 className="text-xl font-bold font-serif text-stone-900 mb-4">{t('export_formats')}</h2>
          <div className="bg-white rounded-xl border border-stone-200 p-6 text-sm text-stone-700">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="pb-2 font-semibold">{t('export_format')}</th>
                  <th className="pb-2 font-semibold">{t('export_type')}</th>
                  <th className="pb-2 font-semibold">{t('export_use_case')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
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

        {/* Webhooks */}
        <section>
          <h2 className="text-xl font-bold font-serif text-stone-900 mb-4">{t('webhooks_title')}</h2>
          <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-4 text-sm text-stone-700">
            <p>
              {t('webhooks_intro', { code: 'POST' })}
            </p>

            <div>
              <h3 className="font-semibold text-stone-800 mb-2">{t('webhooks_creating')}</h3>
              <div className="bg-stone-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                <div className="text-stone-400">{t('webhooks_create_comment')}</div>
                <div className="text-green-400">curl -X POST {apiBase}/api/webhooks \</div>
                <div className="text-green-400 ml-6">-H &quot;Authorization: Bearer rpk_YOUR_KEY&quot; \</div>
                <div className="text-green-400 ml-6">-H &quot;Content-Type: application/json&quot; \</div>
                <div className="text-green-400 ml-6">-d &#123;&quot;url&quot;: &quot;https://example.com/hook&quot;, &quot;events&quot;: [&quot;book.completed&quot;, &quot;session.ended&quot;]&#125;</div>
              </div>
              <p className="text-xs text-stone-500 mt-2">
                {t('webhooks_secret_note', { code: 'secret' })}
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-stone-800 mb-2">{t('webhooks_events')}</h3>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="pb-2 font-semibold">{t('webhooks_event')}</th>
                    <th className="pb-2 font-semibold">{t('webhooks_trigger')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  <tr><td className="py-1.5 font-mono text-xs">book.started</td><td>Reading session started for a book</td></tr>
                  <tr><td className="py-1.5 font-mono text-xs">book.completed</td><td>Book marked as completed</td></tr>
                  <tr><td className="py-1.5 font-mono text-xs">book.updated</td><td>Book metadata or progress updated</td></tr>
                  <tr><td className="py-1.5 font-mono text-xs">session.started</td><td>New reading session started</td></tr>
                  <tr><td className="py-1.5 font-mono text-xs">session.ended</td><td>Reading session ended</td></tr>
                  <tr><td className="py-1.5 font-mono text-xs">annotation.created</td><td>Highlight, note, or bookmark created</td></tr>
                  <tr><td className="py-1.5 font-mono text-xs">annotation.updated</td><td>Annotation edited</td></tr>
                  <tr><td className="py-1.5 font-mono text-xs">annotation.deleted</td><td>Annotation deleted</td></tr>
                  <tr><td className="py-1.5 font-mono text-xs">flashcard.created</td><td>Flashcard generated</td></tr>
                  <tr><td className="py-1.5 font-mono text-xs">flashcard.reviewed</td><td>SM-2 review submitted</td></tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="font-semibold text-stone-800 mb-2">{t('webhooks_payload')}</h3>
              <div className="bg-stone-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                <div className="text-green-400">&#123;</div>
                <div className="text-green-400 ml-4">&quot;event&quot;: &quot;book.completed&quot;,</div>
                <div className="text-green-400 ml-4">&quot;timestamp&quot;: &quot;2026-04-17T12:00:00.000Z&quot;,</div>
                <div className="text-green-400 ml-4">&quot;data&quot;: &#123;</div>
                <div className="text-green-400 ml-8">&quot;bookId&quot;: &quot;abc-123&quot;,</div>
                <div className="text-green-400 ml-8">&quot;title&quot;: &quot;Alice in Wonderland&quot;,</div>
                <div className="text-green-400 ml-8">&quot;author&quot;: &quot;Lewis Carroll&quot;,</div>
                <div className="text-green-400 ml-8">&quot;completedAt&quot;: &quot;2026-04-17T12:00:00.000Z&quot;</div>
                <div className="text-green-400 ml-4">&#125;</div>
                <div className="text-green-400">&#125;</div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-stone-800 mb-2">{t('webhooks_verifying')}</h3>
              <div className="bg-stone-100 rounded-lg p-3 text-xs space-y-2">
                <p>{t('webhooks_verify_intro')}</p>
                <div className="font-mono">
                  <div>X-Webhook-Signature: &lt;HMAC-SHA256 hex&gt;</div>
                  <div>X-Webhook-Event: book.completed</div>
                  <div>X-Webhook-Timestamp: 2026-04-17T12:00:00.000Z</div>
                </div>
                <p className="mt-2">{t('webhooks_verify_desc', { code: 'HMAC-SHA256(rawBody, secret)' })}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-stone-800 mb-2">{t('webhooks_testing')}</h3>
              <div className="bg-stone-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                <div className="text-stone-400">{t('webhooks_test_comment')}</div>
                <div className="text-green-400">curl -X POST {apiBase}/api/webhooks/WEBHOOK_ID/test \</div>
                <div className="text-green-400 ml-6">-H &quot;Authorization: Bearer rpk_YOUR_KEY&quot;</div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <strong>{t('webhooks_retry_policy')}</strong>
            </div>
          </div>
        </section>

        {/* SDK / Libraries */}
        <section>
          <h2 className="text-xl font-bold font-serif text-stone-900 mb-4">{t('code_examples')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <h3 className="font-semibold text-stone-800 mb-2">{t('code_python')}</h3>
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
                <div className="text-green-400">{'    f.write(csv.text)'}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <h3 className="font-semibold text-stone-800 mb-2">{t('code_javascript')}</h3>
              <div className="bg-stone-900 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                <div className="text-stone-400">{"const API = 'https://your-readpal-instance.com';"}</div>
                <div className="text-stone-400">{'const KEY = "rpk_YOUR_KEY";'}</div>
                <div className="text-stone-400 mt-1">{'// List books'}</div>
                <div className="text-green-400">{'const res = await fetch(`${API}/api/books`, {'}</div>
                <div className="text-green-400">{'  headers: { Authorization: `Bearer ${KEY}` }'}</div>
                <div className="text-green-400">{'});'}</div>
                <div className="text-green-400">{'const { data } = await res.json();'}</div>
                <div className="text-stone-400 mt-1">{'// Get reading stats'}</div>
                <div className="text-green-400">{'const stats = await fetch(`${API}/api/stats/dashboard`, {'}</div>
                <div className="text-green-400">{'  headers: { Authorization: `Bearer ${KEY}` }'}</div>
                <div className="text-green-400">{'}).then(r => r.json());'}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Status indicator */}
        {apiKeyHint && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
            {t('api_key_active', { code: apiKeyHint })}
            <Link href="/settings" className="underline ml-1">{t('api_key_manage')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
