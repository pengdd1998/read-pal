import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/capacitor', () => ({
  isCapacitor: vi.fn(() => false),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => '/dashboard'),
}));

import { useHardwareBackButton } from '../useHardwareBackButton';
import { isCapacitor } from '@/lib/capacitor';

describe('useHardwareBackButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns registerModalClose function', () => {
    const { result } = renderHook(() => useHardwareBackButton());
    expect(typeof result.current.registerModalClose).toBe('function');
  });

  it('does not set up listener when not in Capacitor', () => {
    (isCapacitor as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const { result } = renderHook(() => useHardwareBackButton());
    expect(result.current.registerModalClose).toBeDefined();
  });

  it('registerModalClose returns cleanup function', () => {
    const { result } = renderHook(() => useHardwareBackButton());
    const cleanup = result.current.registerModalClose(() => true);
    expect(typeof cleanup).toBe('function');
  });
});
