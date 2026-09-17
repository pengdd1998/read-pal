import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

// ---------------------------------------------------------------------------
// ChatMessageBubble — user/assistant rendering split, sanitized html only
// for assistant content, thumbs feedback wiring (M3.3 deepening).
// ---------------------------------------------------------------------------

const messages = { reader: { regenerate: 'Regenerate', you: 'You' } };

import { ChatMessageBubble } from '../chat/ChatMessageBubble';

type Msg = Parameters<typeof ChatMessageBubble>[0]['msg'];

const baseMsg = (over: Partial<Msg>): Msg => ({
  id: 'm1',
  role: 'assistant',
  content: '回答内容',
  sanitized: '<p>回答内容</p>',
  timestamp: Date.now(),
  ...over,
} as Msg);

const t = (key: string) => key;

function renderBubble(msg: Msg, extra: Partial<Parameters<typeof ChatMessageBubble>[0]> = {}) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <ChatMessageBubble
        msg={msg}
        bookId="b1"
        t={t}
        submitFeedback={vi.fn()}
        onRegenerate={vi.fn()}
        showRegenerate={false}
        {...extra}
      />
    </NextIntlClientProvider>,
  );
}

describe('ChatMessageBubble', () => {
  afterEach(cleanup);

  it('renders user messages as plain text, never as html', () => {
    const { container } = renderBubble(baseMsg({
      role: 'user', content: '<b>not html</b>', sanitized: '',
    }));
    expect(screen.getByText('<b>not html</b>')).toBeTruthy();
    expect(container.querySelector('.prose-sm')).toBeNull();
  });

  it('renders assistant messages through the sanitized-html channel', () => {
    const { container } = renderBubble(baseMsg({ sanitized: '<p>净化的回答</p>' }));
    const html = container.querySelector('.prose-sm') as HTMLElement;
    expect(html).toBeTruthy();
    expect(html.innerHTML).toContain('净化的回答');
  });

  it('renders the sanitized html verbatim (sanitization is useSanitizedMessages\' contract)', () => {
    const { container } = renderBubble(baseMsg({ sanitized: '<p><strong>加粗</strong>回答</p>' }));
    const html = container.querySelector('.prose-sm') as HTMLElement;
    expect(html.innerHTML).toContain('<strong>加粗</strong>');
  });

  it('shows regenerate only when showRegenerate is set, and wires the handler', () => {
    const onRegenerate = vi.fn();
    renderBubble(baseMsg({ role: 'assistant', sanitized: '<p>a</p>' }), { showRegenerate: true, onRegenerate });
    const btn = screen.getByRole('button', { name: 'companion_regenerate' });
    fireEvent.click(btn);
    expect(onRegenerate).toHaveBeenCalled();
    cleanup();
    renderBubble(baseMsg({ role: 'assistant', sanitized: '<p>a</p>' }), { showRegenerate: false });
    expect(screen.queryByRole('button', { name: 'companion_regenerate' })).toBeNull();
  });
});
