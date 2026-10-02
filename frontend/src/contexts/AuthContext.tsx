'use client';

import axios from 'axios';
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import { markWalletProfileComplete } from '@/lib/profile-completion';
import { authAPI, normalizeAuthResponse, User } from '@/lib/api';
import { useWallet } from './WalletContext';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithWallet: (providerName: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  refreshProfileStatus: () => Promise<void>;
  logout: () => void;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_STATUS_COOLDOWN_MS = 15_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, disconnect, authenticateWithWallet } = useWallet();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastProfileCheckRef = useRef<Map<string, number>>(new Map());
  const profileCheckInFlightRef = useRef<Map<string, Promise<void>>>(new Map());

  const persistSession = useCallback((response: unknown) => {
    const session = normalizeAuthResponse(response);
    const nextToken = session.token ?? session.accessToken;

    if (!session.user && !nextToken) {
      return false;
    }

    if (session.user) {
      setUser(session.user);
      localStorage.setItem('user', JSON.stringify(session.user));
    }

    if (nextToken) {
      setToken(nextToken);
      localStorage.setItem('token', nextToken);
      localStorage.setItem('accessToken', nextToken);
    }

    if (session.refreshToken) {
      localStorage.setItem('refreshToken', session.refreshToken);
    }

    return true;
  }, []);

  const loginWithWallet = async (providerName: string) => {
    try {
      setError(null);
      setIsLoading(true);
      const res = await authenticateWithWallet(providerName);
      if (!persistSession(res)) {
        throw new Error('Wallet login failed: Invalid response from server');
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Wallet login failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfileStatus = useCallback(async () => {
    if (!publicKey) {
      return;
    }

    if (user?.walletAddress === publicKey) {
      return;
    }

    const now = Date.now();
    const lastCheckedAt = lastProfileCheckRef.current.get(publicKey) ?? 0;
    if (now - lastCheckedAt < PROFILE_STATUS_COOLDOWN_MS) {
      return;
    }

    const existingRequest = profileCheckInFlightRef.current.get(publicKey);
    if (existingRequest) {
      await existingRequest;
      return;
    }

    const request = (async () => {
      lastProfileCheckRef.current.set(publicKey, now);

      try {
        const result = await authAPI.getProfileStatus(publicKey);
        if (!result.completed || !result.user) {
          return;
        }

        const profileUser = result.user;
        setUser((currentUser) => {
          const resolved = currentUser ?? profileUser;
          if (resolved) {
            try {
              localStorage.setItem('user', JSON.stringify(resolved));
            } catch {}
          }
          return resolved;
        });
        markWalletProfileComplete(publicKey, profileUser.email);
        setError((currentError) =>
          currentError === 'Profile status check is temporarily rate limited. Please wait a moment.'
            ? null
            : currentError
        );
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          const retryAfterSeconds =
            typeof error.response.data?.retry_after === 'number'
              ? error.response.data.retry_after
              : 15;
          lastProfileCheckRef.current.set(publicKey, Date.now() + retryAfterSeconds * 1000);
          setError('Profile status check is temporarily rate limited. Please wait a moment.');
          return;
        }

        console.error('Failed to refresh profile status:', error);
      } finally {
        profileCheckInFlightRef.current.delete(publicKey);
      }
    })();

    profileCheckInFlightRef.current.set(publicKey, request);
    await request;
  }, [publicKey, user]);

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token') ?? localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');

      if (storedToken || storedUser) {
        try {
          if (isMounted) {
            if (storedToken) setToken(storedToken);
            if (storedUser) setUser(JSON.parse(storedUser));
          }
        } catch (e) {
          console.error('Failed to parse stored session user:', e);
        }

        if (storedToken) {
          try {
            const currentUser = await authAPI.getCurrentUser();
            if (currentUser && isMounted) {
              setUser(currentUser);
              localStorage.setItem('user', JSON.stringify(currentUser));
            }
          } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 401) {
              localStorage.removeItem('token');
              localStorage.removeItem('accessToken');
              localStorage.removeItem('user');
              if (isMounted) {
                setUser(null);
                setToken(null);
              }
            }
          }
        }
      }

      if (isMounted) {
        setIsLoading(false);
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle wallet connection checks separately
  useEffect(() => {
    if (user && publicKey) {
      markWalletProfileComplete(publicKey, user.email);
    }
    const storedUser = localStorage.getItem('user');
    if (!storedUser && publicKey) {
      refreshProfileStatus();
    }
  }, [user, publicKey, refreshProfileStatus]);

  const login = async (email: string, password: string, turnstileToken?: string) => {
    try {
      setError(null);
      const response = await authAPI.login({ email, password, turnstileToken });

      const session = normalizeAuthResponse(response);
      if (session.user && session.token) {
        persistSession(session);
        if (publicKey && session.user.email) {
          markWalletProfileComplete(publicKey, session.user.email);
        }
        return response;
      }

      const serverError = (response as any)?.error || (response as any)?.message;
      if (serverError) {
        throw new Error(serverError);
      }

      throw new Error('Login failed: Invalid response from server');
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || err.response?.data?.message || err.message || 'Login failed'
        : err instanceof Error
          ? err.message
          : 'Login failed';
      setError(message);
      throw new Error(message);
    }
  };

  const register = async (email: string, password: string, firstName: string, lastName: string, turnstileToken?: string) => {
    try {
      setError(null);
      const response = await authAPI.register({
        email,
        password,
        firstName,
        lastName,
        walletAddress: publicKey || undefined,
        turnstileToken,
      });

      const session = normalizeAuthResponse(response);
      if (session.user && session.token) {
        persistSession(session);
        if (publicKey && session.user.email) {
          markWalletProfileComplete(publicKey, session.user.email);
        }
        return response;
      }

      const serverError = (response as any)?.error || (response as any)?.message;
      if (serverError) {
        throw new Error(serverError);
      }

      throw new Error('Registration failed: Invalid response from server');
    } catch (err: unknown) {
      const detailsMsg = axios.isAxiosError(err) && Array.isArray(err.response?.data?.details)
        ? err.response.data.details.map((d: any) => d.message).join(', ')
        : null;
      const message = detailsMsg
        || (axios.isAxiosError(err) ? (err.response?.data?.error || err.response?.data?.message || err.message) : null)
        || (err instanceof Error ? err.message : null)
        || 'Registration failed';
      setError(message);
      throw new Error(message);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    disconnect();
    window.location.href = '/auth/login';
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        loginWithWallet,
        register,
        refreshProfileStatus,
        logout,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
