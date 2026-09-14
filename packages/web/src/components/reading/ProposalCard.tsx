'use client';

import React, { memo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';

export interface Proposal {
  id?: string;
  tool?: string;
  args?: Record<string, unknown>;
  preview?: string;
}

interface ProposalCardProps {
  proposal: Proposal;
  bookId: string;
  t: (key: string, params?: Record<string, unknown>) => string;
}

type CardState = 'pending' | 'executing' | 'done' | 'error' | 'dismissed';

/**
 * v2 action-proposal card: the companion PROPOSED a write (save_note /
 * create_flashcard); nothing is written until the reader taps 保存.
 * Execution goes through the existing REST endpoints (auth + idempotency
 * middleware apply) — the LLM path never writes. Ephemeral by design:
 * the proposal is not persisted, so it disappears on reload if ignored.
 */
export const ProposalCard = memo(function ProposalCard({ proposal, bookId, t }: ProposalCardProps) {
  const tc = useTranslations('common');
  const [state, setState] = useState<CardState>('pending');
  const tool = proposal.tool || '';
  const args = proposal.args || {};

  const isNote = tool === 'save_note';
  const title = isNote ? t('proposal_note_title') : t('proposal_card_title');
  const preview = String(proposal.preview || (isNote ? args.content : args.question) || '').slice(0, 120);

  const execute = async () => {
    setState('executing');
    try {
      if (isNote) {
        await api.post('/api/v1/annotations', {
          bookId,
          type: 'note',
          location: { page: 0, chapter: 0 },
          content: String(args.content || ''),
          tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
        });
      } else {
        await api.post('/api/v1/flashcards', {
          bookId,
          question: String(args.question || ''),
          answer: String(args.answer || ''),
        });
      }
      setState('done');
    } catch (err) {
      warn('ProposalCard: execute failed', err);
      setState('error');
    }
  };

  if (state === 'dismissed') return null;

  return (
    <div
      className={`mt-2 rounded-xl border p-3 text-xs ${
        state === 'done'
          ? 'border-green-300/60 dark:border-green-800/40 bg-green-50/60 dark:bg-green-900/15'
          : 'border-amber-300/60 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/15'
      }`}
      role="group"
      aria-label={title}
    >
      <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
        <span aria-hidden="true">{isNote ? '📝' : '🎴'}</span>
        <span>{title}</span>
        {state === 'done' && (
          <span className="ml-auto text-green-600 dark:text-green-400" aria-live="polite">
            ✓ {t('proposal_saved')}
          </span>
        )}
      </div>
      {preview && (
        <p className="mt-1.5 text-amber-900/80 dark:text-amber-100/70 line-clamp-2">{preview}</p>
      )}
      {state !== 'done' && (
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={execute}
            disabled={state === 'executing'}
            className="px-3 py-1.5 rounded-lg font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 min-h-[36px] focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {state === 'executing' ? t('proposal_saving') : t('proposal_save')}
          </button>
          <button
            type="button"
            onClick={() => setState('dismissed')}
            disabled={state === 'executing'}
            className="px-3 py-1.5 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 min-h-[36px] focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {tc('cancel')}
          </button>
          {state === 'error' && (
            <span className="self-center text-red-600 dark:text-red-400" role="alert">
              {t('proposal_failed')}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
