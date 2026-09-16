import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

// ---------------------------------------------------------------------------
// FootnotePopover — read-only note bubble (M3.3: the reading layer had zero
// component tests; the footnote chain is the highest-traffic new surface).
// ---------------------------------------------------------------------------

const messages = {
  reader: {
    footnote_popover_label: 'Footnote {marker}',
    close: 'Close',
  },
};

// jsdom has no layout: the anchored variant computes position from
// getBoundingClientRect (all zeros) and falls back to display:none, so the
// drawer (bottom-sheet) branch is the observable one in this environment.
vi.mock('react-dom', async (importOriginal) => {
  const orig = await importOriginal<typeof import('react-dom')>();
  return { ...orig, createPortal: (node: React.ReactNode) => node };
});

import { FootnotePopover } from '../annotations/FootnotePopover';

function renderPopover(props: Partial<Parameters<typeof FootnotePopover>[0]> = {}) {
  const anchor = document.createElement('a');
  anchor.textContent = '[1]';
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <FootnotePopover
        data={{ marker: '[1]', html: '<p>约瑟夫·罗德亚德·吉卜林，英国小说家</p>', anchorEl: anchor }}
        onClose={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('FootnotePopover', () => {
  beforeEach(() => {
    // matchMedia + innerWidth drive the drawer/anchored branch selection
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 390 });
  });
  afterEach(cleanup);

  it('renders the marker and the definition text', () => {
    renderPopover();
    expect(screen.getByText('[1]')).toBeTruthy();
    expect(screen.getByText(/吉卜林/)).toBeTruthy();
  });

  it('is a labelled dialog', () => {
    renderPopover();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toContain('[1]');
  });

  it('sanitizes script content out of the definition html', () => {
    renderPopover({ data: { marker: '[2]', html: '<p>ok</p><script>window.__pwned=1</script>', anchorEl: document.createElement('a') } });
    expect(screen.getByText(/ok/)).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it('invokes onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('invokes onClose on Escape', () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
