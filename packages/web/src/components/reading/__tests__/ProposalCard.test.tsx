import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

// ---------------------------------------------------------------------------
// ProposalCard — the v2 action-proposal card (M3.3 deepening).
// Pins the security contract: NOTHING hits REST until 保存 is tapped, and
// the two tools route to their own endpoints with the right payload.
// ---------------------------------------------------------------------------

const messages = { common: { save: 'Save', cancel: 'Cancel' } };

const postMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  api: { post: (...a: unknown[]) => postMock(...a) },
}));

import { ProposalCard, type Proposal } from '../chat/ProposalCard';

const t = (key: string) => key;

function renderCard(proposal: Proposal, bookId = 'b1') {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <ProposalCard proposal={proposal} bookId={bookId} t={t} />
    </NextIntlClientProvider>,
  );
}

describe('ProposalCard', () => {
  beforeEach(() => postMock.mockReset());
  afterEach(cleanup);

  it('renders the proposal preview without any REST call', () => {
    renderCard({ tool: 'save_note', args: { content: '冒险的本质是拿确定性换可能性' }, preview: '' });
    expect(screen.getByText(/冒险的本质/)).toBeTruthy();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('save_note executes POST /annotations with the note payload on 保存', async () => {
    postMock.mockResolvedValue({ success: true });
    renderCard({ tool: 'save_note', args: { content: 'note-body', tags: ['a'] } });
    fireEvent.click(screen.getByText('proposal_save'));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    const [url, body] = postMock.mock.calls[0];
    expect(url).toBe('/api/v1/annotations');
    expect(body.type).toBe('note');
    expect(body.content).toBe('note-body');
    expect(body.tags).toEqual(['a']);
  });

  it('create_flashcard routes to /flashcards with question/answer', async () => {
    postMock.mockResolvedValue({ success: true });
    renderCard({ tool: 'create_flashcard', args: { question: 'Q?', answer: 'A.' } });
    fireEvent.click(screen.getByText('proposal_save'));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    const [url, body] = postMock.mock.calls[0];
    expect(url).toBe('/api/v1/flashcards');
    expect(body.question).toBe('Q?');
    expect(body.answer).toBe('A.');
  });

  it('failed execution shows error state and allows retry', async () => {
    postMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ success: true });
    renderCard({ tool: 'save_note', args: { content: 'x' } });
    fireEvent.click(screen.getByText('proposal_save'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('proposal_failed');
    fireEvent.click(screen.getByText('proposal_save')); // same button retries
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2));
  });

  it('dismiss removes the card from the DOM without any REST call', () => {
    renderCard({ tool: 'save_note', args: { content: 'x' } });
    expect(screen.getByText(/note-body|proposal_note_title/)).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/proposal_note_title/)).toBeNull();
    expect(postMock).not.toHaveBeenCalled();
  });
});
