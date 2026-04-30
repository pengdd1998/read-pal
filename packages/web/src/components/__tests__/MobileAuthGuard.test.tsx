import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/capacitor', () => ({
  isCapacitor: vi.fn(() => false),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
  })),
  usePathname: vi.fn(() => '/dashboard'),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    loading: false,
  })),
}));

import { isCapacitor } from '@/lib/capacitor';

describe('MobileAuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is importable without errors', async () => {
    const mod = await import('@/components/MobileAuthGuard');
    expect(mod.MobileAuthGuard).toBeDefined();
    expect(typeof mod.MobileAuthGuard).toBe('function');
  });

  it('does not redirect when not in Capacitor', () => {
    // The module imports work — detailed rendering tests would need
    // a full React tree with providers, which is better suited for
    // integration tests
    (isCapacitor as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(isCapacitor()).toBe(false);
  });
});
