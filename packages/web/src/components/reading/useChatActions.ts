'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import { warn } from '@/lib/logger';

type CompanionMode = 'casual' | 'scholar' | 'socratic';
type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

interface UseChatActionsParams {
  bookId: string;
  companionMode: CompanionMode;
  setCompanionMode: (mode: CompanionMode) => void;
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  sendStreamMessage: (msg: string) => void;
  toast: (msg: string, type: 'error' | 'success' | 'info') => void;
  t: TranslateFn;
}

export function useChatActions({
  bookId,
  companionMode,
  setCompanionMode,
  input,
  setInput,
  loading,
  sendStreamMessage,
  toast,
  t,
}: UseChatActionsParams) {
  const toggleCompanionMode = useCallback(() => {
    const modes: Array<CompanionMode> = ['casual', 'scholar', 'socratic'];
    const idx = modes.indexOf(companionMode);
    const newMode = modes[(idx + 1) % modes.length];
    setCompanionMode(newMode);
    api.patch('/api/settings', { companionMode: newMode }).catch((err) => {
      warn('useChatActions: companion mode toggle failed', err);
      setCompanionMode(companionMode);
      toast(t('companion_mode_error'), 'error');
    });
  }, [companionMode, setCompanionMode, toast, t]);

  const handleSend = useCallback(() => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    analytics.track('ai_chat_sent');
    sendStreamMessage(msg);
  }, [input, loading, setInput, sendStreamMessage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const submitFeedback = useCallback(async (messageId: string, rating: boolean) => {
    try {
      await api.post('/api/agents/feedback', {
        book_id: bookId,
        message_id: messageId,
        rating,
      });
    } catch (err) {
      warn('ChatActions: failed to submit feedback', err);
      toast(t('feedback_submit_error'), 'error');
    }
  }, [bookId, toast, t]);

  return {
    toggleCompanionMode,
    handleSend,
    handleKeyPress,
    submitFeedback,
  };
}
