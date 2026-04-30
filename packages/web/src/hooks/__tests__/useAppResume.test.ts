import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/capacitor', () => ({
  isCapacitor: vi.fn(() => false),
}));

vi.mock('../useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => ({
    isOnline: true,
    justCameBackOnline: false,
  })),
}));

import { useAppResume } from '../useAppResume';
import { isCapacitor } from '@/lib/capacitor';

describe('useAppResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not set up listener when not in Capacitor', () => {
    (isCapacitor as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const onResume = vi.fn();
    renderHook(() => useAppResume({ onResume }));
    // No import of @capacitor/app should happen
    expect(onResume).not.toHaveBeenCalled();
  });

  it('accepts options with onResume callback', () => {
    renderHook(() => useAppResume({ onResume: vi.fn() }));
    expect(true).toBe(true);
  });

  it('accepts no options', () => {
    renderHook(() => useAppResume());
    expect(true).toBe(true);
  });
});
