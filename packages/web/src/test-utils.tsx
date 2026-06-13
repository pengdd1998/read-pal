import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

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

// --- Custom render with providers ---

interface CustomRenderOptions extends RenderOptions {
 auth?: MockAuthState;
}

export function renderWithProviders(
 ui: ReactElement,
 options?: CustomRenderOptions,
): ReturnType<typeof render> {
 return render(ui, { ...options });
}

// --- Re-exports ---
export * from '@testing-library/react';
export { renderWithProviders as render };

// --- Common mock factories ---

export function mockFetch(response: unknown, status = 200) {
 function mockFn(): Promise<Response> {
 return Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(response),
  text: () => Promise.resolve(JSON.stringify(response)),
 } as Response);
 }
 return mockFn;
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
