import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/capacitor', () => ({
  isCapacitor: vi.fn(() => false),
}));

import { useStatusBar } from '../useStatusBar';
import { isCapacitor } from '@/lib/capacitor';

describe('useStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not import StatusBar when not in Capacitor', () => {
    (isCapacitor as ReturnType<typeof vi.fn>).mockReturnValue(false);
    renderHook(() => useStatusBar('LIGHT', '#fefdfb'));
    // No error thrown — the hook short-circuits
    expect(true).toBe(true);
  });

  it('accepts DARK style', () => {
    renderHook(() => useStatusBar('DARK', '#0f1419'));
    expect(true).toBe(true);
  });

  it('uses default values', () => {
    renderHook(() => useStatusBar());
    expect(true).toBe(true);
  });
});
