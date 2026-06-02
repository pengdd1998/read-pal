'use client';

import { useState, useEffect, useCallback } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { hapticMedium } from '@/lib/haptics';
import { TOOLBAR_HEIGHT, TOOLBAR_GAP } from './SelectionToolbar.constants';
import { MobileSelectionToolbar } from './MobileSelectionToolbar';
import { DesktopSelectionToolbar } from './DesktopSelectionToolbar';

interface SelectionToolbarProps {
  text: string;
  rect: DOMRect | null;
  range: Range | null;
  bookTitle?: string;
  author?: string;
  onHighlight: (text: string, color: string, tags?: string[]) => void;
  onNote: (text: string, note: string) => void;
  onDismiss: () => void;
  onAskAI?: (text: string) => void;
}

export function SelectionToolbar({
  text,
  rect,
  range,
  bookTitle,
  author,
  onHighlight,
  onNote,
  onDismiss,
  onAskAI,
}: SelectionToolbarProps) {
  const [showNote, setShowNote] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightToast, setHighlightToast] = useState(false);
  const [showQuoteCard, setShowQuoteCard] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);

  if (!rect || rect.width === 0) return null;

  const isMobile = useIsMobile();

  // Desktop positioning
  const showBelow = rect.top < window.innerHeight * 0.3;
  const top = showBelow ? rect.bottom + TOOLBAR_GAP : rect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP;
  const toolbarWidth = Math.min(420, window.innerWidth - 16);
  const left = Math.max(
    8,
    Math.min(
      rect.left + rect.width / 2 - toolbarWidth / 2,
      window.innerWidth - toolbarWidth - 8,
    ),
  );

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onDismiss();
      }, 1200);
    }
  }, [text, onDismiss]);

  const handleHighlight = useCallback(
    (color: string, tags?: string[]) => {
      hapticMedium();
      onHighlight(text, color, tags);
      setHighlightToast(true);
      setShowTagPicker(false);
      setTimeout(() => setHighlightToast(false), 1200);
    },
    [text, onHighlight],
  );

  const handleTagAndHighlight = useCallback(
    (color: string, tag: string) => {
      hapticMedium();
      onHighlight(text, color, [tag]);
      setHighlightToast(true);
      setShowTagPicker(false);
      setTimeout(() => setHighlightToast(false), 1200);
    },
    [text, onHighlight],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showNote) setShowNote(false);
        else onDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showNote, onDismiss]);

  if (isMobile) {
    return (
      <MobileSelectionToolbar
        text={text}
        showNote={showNote}
        showQuoteCard={showQuoteCard}
        showTagPicker={showTagPicker}
        copied={copied}
        bookTitle={bookTitle}
        author={author}
        onDismiss={onDismiss}
        onToggleNote={() => setShowNote(!showNote)}
        onToggleTagPicker={() => setShowTagPicker(!showTagPicker)}
        onShowQuoteCard={() => setShowQuoteCard(true)}
        onCopy={handleCopy}
        onHighlight={(color) => handleHighlight(color)}
        onTagAndHighlight={handleTagAndHighlight}
        onSaveNote={(note) => {
          onNote(text, note);
          setShowNote(false);
        }}
        onCancelNote={() => setShowNote(false)}
        onCloseQuoteCard={() => setShowQuoteCard(false)}
        onAskAI={onAskAI}
      />
    );
  }

  return (
    <DesktopSelectionToolbar
      text={text}
      top={top}
      left={left}
      showNote={showNote}
      showQuoteCard={showQuoteCard}
      showTagPicker={showTagPicker}
      copied={copied}
      highlightToast={highlightToast}
      bookTitle={bookTitle}
      author={author}
      onToggleNote={() => setShowNote(!showNote)}
      onToggleTagPicker={() => setShowTagPicker(!showTagPicker)}
      onShowQuoteCard={() => setShowQuoteCard(true)}
      onCopy={handleCopy}
      onHighlight={(color) => handleHighlight(color)}
      onTagAndHighlight={handleTagAndHighlight}
      onSaveNote={(note) => {
        onNote(text, note);
        setShowNote(false);
      }}
      onCancelNote={() => setShowNote(false)}
      onCloseQuoteCard={() => setShowQuoteCard(false)}
      onAskAI={onAskAI}
      onDismiss={onDismiss}
    />
  );
}
