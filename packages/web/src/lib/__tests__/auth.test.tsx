import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth';

// Mock the api module
const mockPost = vi.fn();
vi.mock('../api', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

// Mock the auth-fetch module
const mockGetAuthToken = vi.fn();
vi.mock('../auth-fetch', () => ({
  getAuthToken: () => mockGetAuthToken(),
}));

// Test component that consumes useAuth
function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="is-authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="user">{auth.user?.name ?? 'none'}</span>
      <span data-testid="token">{auth.token ?? 'none'}</span>
      <button
        data-testid="login-btn"
        onClick={() => auth.login('test@example.com', 'password123')}
      >
        Login
      </button>
      <button
        data-testid="register-btn"
        onClick={() => auth.register('Test User', 'test@example.com', 'password123')}
      >
        Register
      </button>
      <button data-testid="logout-btn" onClick={() => auth.logout()}>
        Logout
      </button>
      <button
        data-testid="oauth-btn"
        onClick={() =>
          auth.oauthLogin('oauth-token-123', {
            id: 'u1',
            email: 'oauth@test.com',
            name: 'OAuth User',
          })
        }
      >
        OAuth
      </button>
    </div>
  );
}

// Component that uses useAuth outside of AuthProvider
function BareConsumer() {
  useAuth();
  return <div />;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetAuthToken.mockReturnValue(null);
  });

  it('provides unauthenticated state initially when no stored token', async () => {
    mockGetAuthToken.mockReturnValue(null);

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('token')).toHaveTextContent('none');
  });

  it('reads stored token from localStorage on mount', async () => {
    const storedUser = { id: 'u1', email: 'stored@test.com', name: 'Stored User' };
    mockGetAuthToken.mockReturnValue('stored-token-123');
    localStorage.setItem('user', JSON.stringify(storedUser));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('token')).toHaveTextContent('stored-token-123');
    expect(screen.getByTestId('user')).toHaveTextContent('Stored User');
  });

  it('login calls API and updates state', async () => {
    const mockUser = { id: 'u2', email: 'test@example.com', name: 'Test User' };
    mockPost.mockResolvedValue({
      success: true,
      data: { token: 'new-login-token', user: mockUser },
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('token')).toHaveTextContent('new-login-token');
    expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    expect(localStorage.getItem('auth_token')).toBe('new-login-token');
  });

  it('login throws on API error', async () => {
    mockPost.mockResolvedValue({
      success: false,
      error: { code: 'AUTH_FAILED', message: 'Invalid credentials' },
    });

    // Use a separate consumer that captures errors
    function ErrorCatcher() {
      const auth = useAuth();
      return (
        <button
          data-testid="login-btn"
          onClick={() => auth.login('bad@example.com', 'wrong').catch(() => {})}
        >
          Login
        </button>
      );
    }

    render(
      <AuthProvider>
        <ErrorCatcher />
      </AuthProvider>,
    );

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    // Should not have stored anything
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('register calls API and updates state', async () => {
    const mockUser = { id: 'u3', email: 'new@test.com', name: 'New User' };
    mockPost.mockResolvedValue({
      success: true,
      data: { token: 'register-token', user: mockUser },
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    await act(async () => {
      screen.getByTestId('register-btn').click();
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/register', {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('token')).toHaveTextContent('register-token');
    expect(screen.getByTestId('user')).toHaveTextContent('New User');
  });

  it('logout clears state and localStorage', async () => {
    const storedUser = { id: 'u1', email: 'stored@test.com', name: 'Stored User' };
    mockGetAuthToken.mockReturnValue('stored-token-123');
    localStorage.setItem('user', JSON.stringify(storedUser));
    localStorage.setItem('auth_token', 'stored-token-123');

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
    });

    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('token')).toHaveTextContent('none');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('oauthLogin sets state directly', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    await act(async () => {
      screen.getByTestId('oauth-btn').click();
    });

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('token')).toHaveTextContent('oauth-token-123');
    expect(screen.getByTestId('user')).toHaveTextContent('OAuth User');
    expect(localStorage.getItem('auth_token')).toBe('oauth-token-123');
  });

  it('useAuth throws when used outside AuthProvider', () => {
    // Suppress console.error from React error boundary
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<BareConsumer />)).toThrow(
      'useAuth must be used within an AuthProvider',
    );

    spy.mockRestore();
  });
});
