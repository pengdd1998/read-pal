import { describe, expect, it, vi, beforeEach } from 'vitest';
import axios from 'axios';

// vi.hoisted runs BEFORE vi.mock factories are evaluated,
// so mockRequest is available when the axios.create factory executes.
const { mockRequest, mockAuthToken } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockAuthToken: { value: null as string | null },
}));

vi.mock('axios', () => ({
  __esModule: true,
  default: {
    create: vi.fn(() => ({
      request: mockRequest,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      post: vi.fn(),
    })),
    isAxiosError: vi.fn(() => false),
  },
}));

vi.mock('../offline-queue', () => ({
  queueMutation: vi.fn().mockResolvedValue(true),
}));

vi.mock('../auth-fetch', () => ({
  getAuthToken: () => mockAuthToken.value,
}));

// Import after mocks are set up
import { api, API_BASE_URL } from '../api';

describe('API Client', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    mockAuthToken.value = null;
    // Clear internal GET cache between tests
    api.invalidateCache();
  });

  describe('configuration', () => {
    it('exports API_BASE_URL as a string', () => {
      expect(typeof API_BASE_URL).toBe('string');
    });
  });

  describe('GET requests', () => {
    it('makes GET request and returns response data', async () => {
      const mockData = { success: true, data: [{ id: '1', title: 'Book' }] };
      mockRequest.mockResolvedValue({ data: mockData });

      const result = await api.get('/api/books');
      expect(result).toEqual(mockData);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'get',
          url: '/api/books',
        }),
      );
    });

    it('passes params to GET request', async () => {
      mockRequest.mockResolvedValue({ data: { success: true, data: [] } });

      await api.get('/api/books', { page: 1, limit: 10 });
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'get',
          url: '/api/books',
          params: { page: 1, limit: 10 },
        }),
      );
    });

    it('returns error result for failed GET requests', async () => {
      mockRequest.mockRejectedValue(new Error('Network error'));

      const result = await api.get('/api/books');
      expect(result.success).toBe(false);
    });
  });

  describe('POST requests', () => {
    it('makes POST request with JSON body', async () => {
      const mockResponse = {
        success: true,
        data: { token: 'abc123', user: { id: '1', email: 'test@test.com' } },
      };
      mockRequest.mockResolvedValue({ data: mockResponse });

      const result = await api.post('/api/auth/login', {
        email: 'test@test.com',
        password: 'password123',
      });

      expect(result).toEqual(mockResponse);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: '/api/auth/login',
          data: { email: 'test@test.com', password: 'password123' },
        }),
      );
    });

    it('throws on POST error when online', async () => {
      const error = Object.assign(new Error('Internal Server Error'), {
        response: { status: 500, data: {} },
      });
      mockRequest.mockRejectedValue(error);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      // Ensure navigator.onLine is true so it doesn't queue offline
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });

      await expect(
        api.post('/api/auth/login', { email: 'a@b.com', password: 'x' }),
      ).rejects.toThrow('Internal Server Error');
    });
  });

  describe('PUT requests', () => {
    it('makes PUT request with data body', async () => {
      const mockResponse = { success: true, data: { id: '1', title: 'Updated' } };
      mockRequest.mockResolvedValue({ data: mockResponse });

      const result = await api.put('/api/books/1', { title: 'Updated Book' });

      expect(result).toEqual(mockResponse);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'put',
          url: '/api/books/1',
          data: { title: 'Updated Book' },
        }),
      );
    });
  });

  describe('DELETE requests', () => {
    it('makes DELETE request without body', async () => {
      const mockResponse = { success: true, data: null };
      mockRequest.mockResolvedValue({ data: mockResponse });

      const result = await api.delete('/api/books/1');

      expect(result).toEqual(mockResponse);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'delete',
          url: '/api/books/1',
        }),
      );
    });
  });

  describe('PATCH requests', () => {
    it('makes PATCH request with data body', async () => {
      const mockResponse = { success: true, data: { id: '1', read: true } };
      mockRequest.mockResolvedValue({ data: mockResponse });

      const result = await api.patch('/api/books/1', { read: true });

      expect(result).toEqual(mockResponse);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'patch',
          url: '/api/books/1',
          data: { read: true },
        }),
      );
    });
  });

  describe('error handling', () => {
    it('returns { success: false } for network errors on GET', async () => {
      mockRequest.mockRejectedValue(new Error('Network Error'));

      const result = await api.get('/api/books');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error?.code).toBe('NETWORK_ERROR');
      }
    });

    it('returns { success: false } for HTTP errors on GET', async () => {
      const error = Object.assign(new Error('Not Found'), {
        response: { status: 404, data: { success: false } },
      });
      mockRequest.mockRejectedValue(error);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      const result = await api.get('/api/books/nonexistent');
      expect(result.success).toBe(false);
    });

    it('queues offline mutations for POST when navigator is offline', async () => {
      mockRequest.mockRejectedValue(new Error('Network Error'));
      vi.mocked(axios.isAxiosError).mockReturnValue(true);
      mockAuthToken.value = 'valid-token';

      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      const result = await api.post('/api/books', { title: 'Offline Book' });
      expect(result.success).toBe(true);

      // Restore
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });
    });
  });
});
