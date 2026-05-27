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
import { authAPI, User } from '@/lib/api';
import { useWallet } from './WalletContext';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  refreshProfileStatus: () => Promise<void>;
  logout: () => void;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_STATUS_COOLDOWN_MS = 15_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastProfileCheckRef = useRef<Map<string, number>>(new Map());
  const profileCheckInFlightRef = useRef<Map<string, Promise<void>>>(new Map());

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

        setUser((currentUser) => currentUser ?? result.user);
        markWalletProfileComplete(publicKey, result.user.email);
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
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));

          // Verify token is still valid
          const currentUser = await authAPI.getCurrentUser();
          if (!currentUser) {
            // Token invalid, clear storage
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            setToken(null);
          }
        } catch (err) {
          console.error('Failed to restore session:', err);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }

      if (!storedUser && publicKey) {
        await refreshProfileStatus();
      }
      setIsLoading(false);
    };

    initAuth();
  }, [publicKey, refreshProfileStatus]);

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      const response = await authAPI.login({ email, password });

      setUser(response.user);
      setToken(response.token);

      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      if (publicKey) {
        markWalletProfileComplete(publicKey, response.user.email);
      }
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message || 'Login failed'
        : err instanceof Error
          ? err.message
          : 'Login failed';
      setError(message);
      throw err;
    }
  };

  const register = async (email: string, password: string, firstName: string, lastName: string) => {
    try {
      setError(null);
      const response = await authAPI.register({
        email,
        password,
        firstName,
        lastName,
        walletAddress: publicKey || undefined,
      });

      setUser(response.user);
      setToken(response.token);

      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      if (publicKey) {
        markWalletProfileComplete(publicKey, response.user.email);
      }
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message || 'Registration failed'
        : err instanceof Error
          ? err.message
          : 'Registration failed';
      setError(message);
      throw err;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
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
