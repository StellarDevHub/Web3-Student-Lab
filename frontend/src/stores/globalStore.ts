import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { useEditorStore } from './editorStore';
import { devtools, logger } from './middleware';
import { useNetworkStore } from './networkStore';
import { useUserStore } from './userStore';

export interface GlobalState {
  // Global UI state
  isOnline: boolean;
  appVersion: string;
  buildNumber: string;
  environment: 'development' | 'staging' | 'production';

  // Global loading states
  globalLoading: boolean;
  loadingMessage: string | null;

  // Global error handling
  globalError: {
    message: string;
    code?: string;
    timestamp: number;
  } | null;

  // Performance monitoring
  performance: {
    renderCount: number;
    lastRenderTime: number;
    memoryUsage: number | null;
  };

  // Feature flags
  features: {
    aiChat: boolean;
    collaborativeEditing: boolean;
    semanticSearch: boolean;
    advancedAnalytics: boolean;
  };
}

export interface GlobalActions {
  setOnlineStatus: (isOnline: boolean) => void;
  setGlobalLoading: (loading: boolean, message?: string) => void;
  setGlobalError: (error: GlobalState['globalError']) => void;
  clearGlobalError: () => void;
  trackPerformance: (renderTime: number) => void;
  updateMemoryUsage: () => void;
  toggleFeature: (feature: keyof GlobalState['features']) => void;
  resetAllStores: () => void;
  exportState: () => string;
  importState: (state: string) => void;
}

export type GlobalStore = GlobalState & GlobalActions;

const initialState: GlobalState = {
  isOnline: navigator.onLine,
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0',
  buildNumber: process.env.NEXT_PUBLIC_BUILD_NUMBER ?? 'dev',
  environment: (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development',

  globalLoading: false,
  loadingMessage: null,

  globalError: null,

  performance: {
    renderCount: 0,
    lastRenderTime: 0,
    memoryUsage: null,
  },

  features: {
    aiChat: true,
    collaborativeEditing: true,
    semanticSearch: true,
    advancedAnalytics: false,
  },
};

export const useGlobalStore = create<GlobalStore>()(
  devtools(
    logger(
      (set, get) => ({
        ...initialState,

        setOnlineStatus: (isOnline) => set({ isOnline }),

        setGlobalLoading: (globalLoading, loadingMessage) => set({ globalLoading, loadingMessage }),

        setGlobalError: (globalError) => set({ globalError }),

        clearGlobalError: () => set({ globalError: null }),

        trackPerformance: (renderTime) => {
          const currentPerformance = get().performance;
          set({
            performance: {
              ...currentPerformance,
              renderCount: currentPerformance.renderCount + 1,
              lastRenderTime: renderTime,
            },
          });
        },

        updateMemoryUsage: () => {
          if ('memory' in performance) {
            const memory = (performance as any).memory;
            set({
              performance: {
                ...get().performance,
                memoryUsage: memory.usedJSHeapSize,
              },
            });
          }
        },

        toggleFeature: (feature) => {
          const features = get().features;
          set({
            features: {
              ...features,
              [feature]: !features[feature],
            },
          });
        },

        resetAllStores: () => {
          // Reset all individual stores
          useAuthStore.getState().logout();
          useEditorStore.getState().reset();
          useNetworkStore.getState().disconnect();

          // Reset global store
          set(initialState);
        },

        exportState: () => {
          const state = {
            global: get(),
            auth: useAuthStore.getState(),
            editor: useEditorStore.getState(),
            network: useNetworkStore.getState(),
            user: useUserStore.getState(),
          };
          return JSON.stringify(state, null, 2);
        },

        importState: (stateString) => {
          try {
            const state = JSON.parse(stateString);

            // Import global state
            if (state.global) {
              const { performance, ...globalState } = state.global;
              set(globalState);
            }

            // Import individual store states
            if (state.auth) {
              const authStore = useAuthStore.getState();
              Object.keys(state.auth).forEach((key) => {
                if (
                  key in authStore &&
                  typeof authStore[key as keyof typeof authStore] === 'function'
                ) {
                  // Skip functions, only set state properties
                }
              });
            }

            if (state.editor) {
              const editorStore = useEditorStore.getState();
              Object.keys(state.editor).forEach((key) => {
                if (
                  key in editorStore &&
                  typeof editorStore[key as keyof typeof editorStore] === 'function'
                ) {
                  // Skip functions, only set state properties
                }
              });
            }

            if (state.network) {
              const networkStore = useNetworkStore.getState();
              Object.keys(state.network).forEach((key) => {
                if (
                  key in networkStore &&
                  typeof networkStore[key as keyof typeof networkStore] === 'function'
                ) {
                  // Skip functions, only set state properties
                }
              });
            }

            if (state.user) {
              const userStore = useUserStore.getState();
              Object.keys(state.user).forEach((key) => {
                if (
                  key in userStore &&
                  typeof userStore[key as keyof typeof userStore] === 'function'
                ) {
                  // Skip functions, only set state properties
                }
              });
            }
          } catch (error) {
            console.error('Failed to import state:', error);
            set({
              globalError: {
                message: 'Failed to import state data',
                timestamp: Date.now(),
              },
            });
          }
        },
      }),
      { name: 'global-store', enabled: true }
    ),
    { name: 'global-devtools', enabled: true }
  )
);

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useGlobalStore.getState().setOnlineStatus(true);
  });

  window.addEventListener('offline', () => {
    useGlobalStore.getState().setOnlineStatus(false);
  });
}

// Selectors for optimized re-renders
export const useGlobal = () => {
  const store = useGlobalStore();

  return {
    // Global state
    isOnline: store.isOnline,
    appVersion: store.appVersion,
    buildNumber: store.buildNumber,
    environment: store.environment,
    globalLoading: store.globalLoading,
    loadingMessage: store.loadingMessage,
    globalError: store.globalError,
    performance: store.performance,
    features: store.features,

    // Global actions
    setOnlineStatus: store.setOnlineStatus,
    setGlobalLoading: store.setGlobalLoading,
    setGlobalError: store.setGlobalError,
    clearGlobalError: store.clearGlobalError,
    trackPerformance: store.trackPerformance,
    updateMemoryUsage: store.updateMemoryUsage,
    toggleFeature: store.toggleFeature,
    resetAllStores: store.resetAllStores,
    exportState: store.exportState,
    importState: store.importState,
  };
};

// Selective selectors
export const useGlobalIsOnline = () => useGlobalStore((state) => state.isOnline);
export const useGlobalLoading = () => useGlobalStore((state) => state.globalLoading);
export const useGlobalError = () => useGlobalStore((state) => state.globalError);
export const useGlobalFeatures = () => useGlobalStore((state) => state.features);
export const useGlobalPerformance = () => useGlobalStore((state) => state.performance);

// Computed selectors
export const useIsDevelopment = () =>
  useGlobalStore((state) => state.environment === 'development');
export const useIsProduction = () => useGlobalStore((state) => state.environment === 'production');
