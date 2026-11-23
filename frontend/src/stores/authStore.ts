import { create } from 'zustand';
import { devtools, logger, securePersist } from './middleware';
import { authAPI, User } from '@/lib/api';

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
  updateUser: (user: Partial<User>) => void;
}

export type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

export const useAuthStore = create<AuthStore>()(
  devtools(
    logger(
      securePersist(
        (set, get) => ({
          ...initialState,

          login: async (email: string, password: string) => {
            set({ isLoading: true, error: null });
            try {
              const response = await authAPI.login({ email, password });

              set({
                user: response.user,
                token: response.token,
                isAuthenticated: true,
                isLoading: false,
              });

              // Store in localStorage for persistence
              localStorage.setItem('token', response.token);
              localStorage.setItem('user', JSON.stringify(response.user));
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Login failed';
              set({ error: message, isLoading: false });
              throw err;
            }
          },

          register: async (
            email: string,
            password: string,
            firstName: string,
            lastName: string
          ) => {
            set({ isLoading: true, error: null });
            try {
              const response = await authAPI.register({
                email,
                password,
                firstName,
                lastName,
              });

              set({
                user: response.user,
                token: response.token,
                isAuthenticated: true,
                isLoading: false,
              });

              localStorage.setItem('token', response.token);
              localStorage.setItem('user', JSON.stringify(response.user));
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Registration failed';
              set({ error: message, isLoading: false });
              throw err;
            }
          },

          logout: () => {
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              error: null,
            });

            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/auth/login';
          },

          clearError: () => set({ error: null }),

          setLoading: (loading: boolean) => set({ isLoading: loading }),

          updateUser: (userData: Partial<User>) => {
            const currentUser = get().user;
            if (currentUser) {
              const updatedUser = { ...currentUser, ...userData };
              set({ user: updatedUser });
              localStorage.setItem('user', JSON.stringify(updatedUser));
            }
          },
        }),
        {
          name: 'auth-storage',
          exclude: ['error', 'isLoading'], // Don't persist these
        }
      ),
      { name: 'auth-store', enabled: true }
    ),
    { name: 'auth-devtools', enabled: true }
  )
);

// Selectors for optimized re-renders
export const useAuth = () => {
  const store = useAuthStore();

  return {
    // Auth state
    user: store.user,
    token: store.token,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    error: store.error,

    // Auth actions
    login: store.login,
    register: store.register,
    logout: store.logout,
    clearError: store.clearError,
    setLoading: store.setLoading,
    updateUser: store.updateUser,
  };
};

// Selective selectors for specific data to prevent unnecessary re-renders
export const useAuthUser = () => useAuthStore((state) => state.user);
export const useAuthIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthIsLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
