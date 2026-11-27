/**
 * ChatMessageBubble — faithfulness notice (GB-11).
 *
 * The server flags unsupported statements with a typed SSE frame that
 * carries `content`. The client used to append that text to the answer, so
 * readers saw "may not come from the book" as part of the reply itself.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessageBubble } from '../ChatMessageBubble';

vi.mock('../ProposalCard', () => ({ ProposalCard: () => null }));

const t = (key: string, params?: Record<string, unknown>) =>
  key === 'companion_faithfulness_warning' ? `faith-note(${params?.count})` : key;

const base = {
  id: 'a1', role: 'assistant' as const, content: '答案正文',
  sanitized: '<p>答案正文</p>', timestamp: 1,
};

function renderBubble(msg: typeof base & { faithfulnessWarningCount?: number; streaming?: boolean }) {
  render(
    <ChatMessageBubble
      msg={msg}
      bookId="book-1"
      t={t}
      submitFeedback={() => {}}
      onRegenerate={() => {}}
      showRegenerate={false}
    />,
  );
}

function body(): string | null | undefined {
  return document.querySelector('.prose-sm')?.textContent;
}

describe('ChatMessageBubble — faithfulness notice', () => {
  it('renders the note apart from the reply body', () => {
    renderBubble({ ...base, faithfulnessWarningCount: 2 });
    const note = screen.getByRole('note');
    expect(note.textContent).toBe('faith-note(2)');
    expect(body()).toBe('答案正文');
  });

  it('shows no note when nothing was flagged', () => {
    renderBubble(base);
    expect(screen.queryByRole('note')).toBeNull();
    expect(body()).toBe('答案正文');
  });

  it('waits for the stream to finish before showing it', () => {
    renderBubble({ ...base, faithfulnessWarningCount: 1, streaming: true });
    expect(screen.queryByRole('note')).toBeNull();
  });
});
