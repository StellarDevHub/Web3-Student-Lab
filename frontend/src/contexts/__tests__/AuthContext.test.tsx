import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';
import { authAPI } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  authAPI: {
    login: vi.fn(),
    register: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(null),
    getProfileStatus: vi.fn().mockResolvedValue({ completed: false }),
  },
  normalizeAuthResponse: vi.fn((res) => res),
}));

vi.mock('../WalletContext', () => ({
  useWallet: vi.fn(() => ({
    publicKey: null,
    disconnect: vi.fn(),
    authenticateWithWallet: vi.fn(),
  })),
}));

vi.mock('@/lib/profile-completion', () => ({
  markWalletProfileComplete: vi.fn(),
}));

vi.mock('@/services/session/broadcastSync', () => ({
  getSessionBroadcastManager: vi.fn(() => ({
    broadcast: vi.fn(),
    on: vi.fn(() => vi.fn()),
  })),
}));

function AuthConsumer({ onAuthReady }: { onAuthReady: (auth: ReturnType<typeof useAuth>) => void }) {
  const auth = useAuth();
  React.useEffect(() => {
    onAuthReady(auth);
  }, [auth, onAuthReady]);
  return <div data-testid="auth-ready">{auth.isAuthenticated ? 'authenticated' : 'unauthenticated'}</div>;
}

describe('AuthContext Multi-Argument Token Passing & Turnstile Signatures (FE-059)', () => {
  let authContext: ReturnType<typeof useAuth>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const setup = async () => {
    render(
      <AuthProvider>
        <AuthConsumer onAuthReady={(auth) => { authContext = auth; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(authContext).toBeDefined();
    });
  };

  it('forwards turnstileToken to authAPI.login when provided', async () => {
    await setup();

    const mockResponse = {
      user: { id: '1', email: 'test@example.com', name: 'Test' },
      token: 'mock-jwt-token',
    };
    vi.mocked(authAPI.login).mockResolvedValueOnce(mockResponse as any);

    await act(async () => {
      await authContext.login('test@example.com', 'password123', 'turnstile-token-xyz');
    });

    expect(authAPI.login).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
      turnstileToken: 'turnstile-token-xyz',
    });
    expect(authContext.isAuthenticated).toBe(true);
  });

  it('allows login without turnstileToken (optional parameter)', async () => {
    await setup();

    const mockResponse = {
      user: { id: '1', email: 'test@example.com', name: 'Test' },
      token: 'mock-jwt-token',
    };
    vi.mocked(authAPI.login).mockResolvedValueOnce(mockResponse as any);

    await act(async () => {
      await authContext.login('test@example.com', 'password123');
    });

    expect(authAPI.login).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
      turnstileToken: undefined,
    });
  });

  it('forwards turnstileToken to authAPI.register when provided', async () => {
    await setup();

    const mockResponse = {
      user: { id: '2', email: 'new@example.com', name: 'Jane Doe' },
      token: 'mock-jwt-token-register',
    };
    vi.mocked(authAPI.register).mockResolvedValueOnce(mockResponse as any);

    await act(async () => {
      await authContext.register(
        'new@example.com',
        'securePass123',
        'Jane',
        'Doe',
        'turnstile-register-token'
      );
    });

    expect(authAPI.register).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'securePass123',
      firstName: 'Jane',
      lastName: 'Doe',
      walletAddress: undefined,
      turnstileToken: 'turnstile-register-token',
    });
    expect(authContext.isAuthenticated).toBe(true);
  });

  it('allows register without turnstileToken (optional parameter)', async () => {
    await setup();

    const mockResponse = {
      user: { id: '2', email: 'new@example.com', name: 'Jane Doe' },
      token: 'mock-jwt-token-register',
    };
    vi.mocked(authAPI.register).mockResolvedValueOnce(mockResponse as any);

    await act(async () => {
      await authContext.register(
        'new@example.com',
        'securePass123',
        'Jane',
        'Doe'
      );
    });

    expect(authAPI.register).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'securePass123',
      firstName: 'Jane',
      lastName: 'Doe',
      walletAddress: undefined,
      turnstileToken: undefined,
    });
  });
});
