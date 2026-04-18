import { render, type RenderOptions } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { vi } from 'vitest';

// --- Mock Auth Context ---

interface MockAuthState {
  user?: {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    settings?: Record<string, unknown>;
  } | null;
  isAuthenticated?: boolean;
  isLoading?: boolean;
}

// Create a simple mock auth provider for tests
function MockAuthProvider({
  children,
  user = null,
  isAuthenticated = false,
  isLoading = false,
}: MockAuthState & { children: ReactNode }) {
  // Mock the auth module — components import useAuth from '@/lib/auth'
  // We'll rely on module mocking instead of a full provider
  return <>{children}</>;
}

// --- Custom render with providers ---

interface CustomRenderOptions extends RenderOptions {
  auth?: MockAuthState;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: CustomRenderOptions,
) {
  return render(ui, { ...options });
}

// --- Re-exports ---
export * from '@testing-library/react';
export { renderWithProviders as render };

// --- Common mock factories ---

export function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

export function mockUser(overrides?: Record<string, unknown>) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    avatar: null,
    settings: { theme: 'system', fontSize: 16 },
    ...overrides,
  };
}

export function mockBook(overrides?: Record<string, unknown>) {
  return {
    id: 'test-book-id',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    coverUrl: null,
    fileType: 'epub',
    totalPages: 180,
    currentPage: 50,
    progress: 27.78,
    status: 'reading',
    tags: ['classic', 'fiction'],
    ...overrides,
  };
}

export function mockAnnotation(overrides?: Record<string, unknown>) {
  return {
    id: 'test-annotation-id',
    type: 'highlight',
    content: 'So we beat on, boats against the current...',
    note: null,
    color: '#ffeb3b',
    tags: [],
    location: { page: 180, chapter: 9 },
    ...overrides,
  };
}
