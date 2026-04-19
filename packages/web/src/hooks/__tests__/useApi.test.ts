import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApi } from '../useApi';

// Mock the api module
const mockGet = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

describe('useApi', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('starts in loading state when auto-fetching', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useApi('/api/books'));
    expect(result.current.loading).toBe(true);
    expect(result.current.status).toBe('loading');
  });

  it('sets data on successful fetch', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [{ id: '1', title: 'Book' }],
    });

    const { result } = renderHook(() => useApi<{ id: string }[]>('/api/books'));

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(result.current.data).toEqual([{ id: '1', title: 'Book' }]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('sets error on API failure', async () => {
    mockGet.mockResolvedValue({
      success: false,
      error: { message: 'Not found' },
    });

    const { result } = renderHook(() => useApi('/api/books/missing'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toBe('Not found');
    expect(result.current.data).toBeUndefined();
  });

  it('sets error on network exception', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useApi('/api/books'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toBe('Network error');
  });

  it('does not auto-fetch when manual=true', () => {
    mockGet.mockResolvedValue({ success: true, data: 'test' });

    const { result } = renderHook(() =>
      useApi('/api/books', { manual: true }),
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.loading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('refetch triggers a fetch', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { id: '1' },
    });

    const { result } = renderHook(() =>
      useApi('/api/books', { manual: true }),
    );

    expect(result.current.status).toBe('idle');

    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('returns undefined data when url is null', () => {
    const { result } = renderHook(() => useApi(null));

    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeUndefined();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('applies transform to response data', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [1, 2, 3],
    });

    const double = (data: number[]) => data.map((n) => n * 2) as number[];

    const { result } = renderHook(
      ({ transform }: { transform: (d: number[]) => number[] }) =>
        useApi('/api/numbers', { transform }),
      { initialProps: { transform: double } },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    }, { timeout: 3000 });

    expect(result.current.data).toEqual([2, 4, 6]);
  });

  it('uses defaultValue while loading', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useApi('/api/books', { defaultValue: [] }),
    );

    expect(result.current.data).toEqual([]);
  });
});
