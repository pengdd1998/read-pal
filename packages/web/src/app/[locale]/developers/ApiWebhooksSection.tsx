'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { API_BASE_URL } from '@/lib/api';

export function ApiWebhooksSection() {
 const t = useTranslations('developers');
 const [apiBase, setApiBase] = useState('');

 useEffect(() => {
 setApiBase(API_BASE_URL || window.location.origin);
 }, []);

 return (
 <section>
  <h2 className="text-xl font-bold font-serif text-gray-900 dark:text-gray-100 mb-4">{t('webhooks_title')}</h2>
  <div className="bg-surface-0 rounded-xl border border-surface-3 p-6 space-y-4 text-sm text-gray-700 dark:text-gray-300">
  <p>
   {t('webhooks_intro', { code: 'POST' })}
  </p>

  <div>
   <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('webhooks_creating')}</h3>
   <div className="bg-stone-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
   <div className="text-stone-400">{t('webhooks_create_comment')}</div>
   <div className="text-green-400">curl -X POST {apiBase}/api/webhooks \</div>
   <div className="text-green-400 ml-6">-H &quot;Authorization: Bearer rpk_YOUR_KEY&quot; \</div>
   <div className="text-green-400 ml-6">-H &quot;Content-Type: application/json&quot; \</div>
   <div className="text-green-400 ml-6">-d &#123;&quot;url&quot;: &quot;https://example.com/hook&quot;, &quot;events&quot;: [&quot;book.completed&quot;, &quot;session.ended&quot;]&#125;</div>
   </div>
   <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
   {t('webhooks_secret_note', { code: 'secret' })}
   </p>
  </div>

  <div>
   <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('webhooks_events')}</h3>
   <div className="overflow-x-auto">
   <table className="w-full text-left">
    <thead>
    <tr className="border-b border-surface-3">
     <th className="pb-2 font-semibold">{t('webhooks_event')}</th>
     <th className="pb-2 font-semibold">{t('webhooks_trigger')}</th>
    </tr>
    </thead>
    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
    <tr><td className="py-1.5 font-mono text-xs">book.started</td><td>{t('webhook_book_started')}</td></tr>
    <tr><td className="py-1.5 font-mono text-xs">book.completed</td><td>{t('webhook_book_completed')}</td></tr>
    <tr><td className="py-1.5 font-mono text-xs">book.updated</td><td>{t('webhook_book_updated')}</td></tr>
    <tr><td className="py-1.5 font-mono text-xs">session.started</td><td>{t('webhook_session_started')}</td></tr>
    <tr><td className="py-1.5 font-mono text-xs">session.ended</td><td>{t('webhook_session_ended')}</td></tr>
    <tr><td className="py-1.5 font-mono text-xs">annotation.created</td><td>{t('webhook_annotation_created')}</td></tr>
    <tr><td className="py-1.5 font-mono text-xs">annotation.updated</td><td>{t('webhook_annotation_updated')}</td></tr>
    <tr><td className="py-1.5 font-mono text-xs">annotation.deleted</td><td>{t('webhook_annotation_deleted')}</td></tr>
    <tr><td className="py-1.5 font-mono text-xs">flashcard.created</td><td>{t('webhook_flashcard_created')}</td></tr>
    <tr><td className="py-1.5 font-mono text-xs">flashcard.reviewed</td><td>{t('webhook_flashcard_reviewed')}</td></tr>
    </tbody>
   </table>
   </div>
  </div>

  <div>
   <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('webhooks_payload')}</h3>
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
   <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('webhooks_verifying')}</h3>
   <div className="bg-surface-2 rounded-lg p-3 text-xs space-y-2">
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
   <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('webhooks_testing')}</h3>
   <div className="bg-stone-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
   <div className="text-stone-400">{t('webhooks_test_comment')}</div>
   <div className="text-green-400">curl -X POST {apiBase}/api/webhooks/WEBHOOK_ID/test \</div>
   <div className="text-green-400 ml-6">-H &quot;Authorization: Bearer rpk_YOUR_KEY&quot;</div>
   </div>
  </div>

  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
   <strong>{t('webhooks_retry_policy')}</strong>
  </div>
  </div>
 </section>
 );
}
