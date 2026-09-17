import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

// ---------------------------------------------------------------------------
// AnnotationCard — the annotation list row (M3.3 deepening): renders type
// badge/content, wires click-through and delete with confirm semantics.
// ---------------------------------------------------------------------------

const messages = {
  reader: {
    delete_confirm: 'Delete?',
    annotation_type_highlight: 'Highlight',
    annotation_type_note: 'Note',
  },
};

import { AnnotationCard } from '../annotations/AnnotationCard';
import type { Annotation } from '@read-pal/shared';

const ann = (over: Partial<Annotation> = {}): Annotation => ({
  id: 'a1',
  type: 'highlight',
  content: '能创造善良',
  note: null,
  tags: ['哲学'],
  createdAt: '2026-09-16T00:00:00Z',
  ...over,
} as Annotation);

function renderCard(a: Annotation, handlers = { onDelete: vi.fn(), onUpdate: vi.fn(), onClick: vi.fn() }) {
  const utils = render(
    <NextIntlClientProvider messages={messages} locale="en">
      <AnnotationCard annotation={a} bookTitle="路边野餐" author="作者" {...handlers} />
    </NextIntlClientProvider>,
  );
  return { ...utils, handlers };
}

describe('AnnotationCard', () => {
  afterEach(cleanup);

  it('renders the quoted content', () => {
    renderCard(ann());
    expect(screen.getByText(/能创造善良/)).toBeTruthy();
  });

  it('shows the note text for note-type annotations', () => {
    renderCard(ann({ type: 'note', note: '我的批注内容' }));
    expect(screen.getByText(/我的批注内容/)).toBeTruthy();
  });

  it('fires onClick with the annotation when the row is clicked', () => {
    const { handlers } = renderCard(ann());
    fireEvent.click(screen.getByText(/能创造善良/));
    expect(handlers.onClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('delete arms a confirmation row, then Yes fires onDelete with the id', () => {
    const { handlers } = renderCard(ann());
    fireEvent.click(screen.getByRole('button', { name: /delete|删除/i }));
    // arming shows a Yes/Cancel pair; only Yes performs the delete
    fireEvent.click(screen.getByRole('button', { name: /yes|是|确认/i }));
    expect(handlers.onDelete).toHaveBeenCalledWith('a1');
  });

  it('cancel in the confirmation row disarms without deleting', () => {
    const { handlers } = renderCard(ann());
    fireEvent.click(screen.getByRole('button', { name: /delete|删除/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel|取消/i }));
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });
});
