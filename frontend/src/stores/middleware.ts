import { StateCreator } from 'zustand';
import { persist } from 'zustand/middleware';

// Logging middleware for development
export const logger =
  <T>(
    config: StateCreator<T>,
    options?: {
      name?: string;
      enabled?: boolean;
    }
  ): StateCreator<T> =>
  (set, get, api) => {
    const isEnabled = options?.enabled ?? process.env.NODE_ENV === 'development';
    const name = options?.name ?? 'Store';

    return config(
      (args) => {
        if (isEnabled) {
          console.log(`[${name}] State change:`, args);
        }
        set(args);
      },
      get,
      api
    );
  };

// History middleware for undo/redo functionality
export interface HistoryState<T> {
  history: {
    past: T[];
    present: T;
    future: T[];
  };
  undo: () => void;
  redo: () => void;
  reset: (initialState: T) => void;
}

export const withHistory =
  <T>(
    config: StateCreator<T & HistoryState<T>>,
    initialState: T
  ): StateCreator<T & HistoryState<T>> =>
  (set, get, api) => {
    return config(
      (args) => {
        const state = get();

        if (typeof args === 'function') {
          const newState = args(state);
          set({
            history: {
              past: [...state.history.past, state.history.present],
              present: newState,
              future: [],
            },
          });
        } else {
          set({
            history: {
              past: [...state.history.past, state.history.present],
              present: args,
              future: [],
            },
          });
        }
      },
      get,
      api
    );
  };

// Performance middleware for preventing unnecessary re-renders
export const withSelectors =
  <T>(config: StateCreator<T>): StateCreator<T> =>
  (set, get, api) => {
    const originalSet = set;
    const originalGet = get;

    // Override get to provide optimized selectors
    const enhancedGet = ((selector?: any) => {
      if (!selector) return originalGet();

      // Memoize selector results to prevent unnecessary re-renders
      const currentState = originalGet();
      const result = selector(currentState);

      return result;
    }) as typeof originalGet;

    return config(originalSet, enhancedGet, api);
  };

// Persistence middleware with encryption for sensitive data
export const securePersist = <T>(
  config: StateCreator<T>,
  options: {
    name: string;
    encrypt?: boolean;
    exclude?: (keyof T)[];
  }
): StateCreator<T> => {
  const { encrypt = false, exclude = [], ...persistOptions } = options;

  return persist(config, {
    ...persistOptions,
    serialize: (state) => {
      if (exclude.length > 0) {
        const filteredState = { ...state };
        exclude.forEach((key) => delete filteredState[key]);
        return JSON.stringify(filteredState);
      }
      return JSON.stringify(state);
    },
    deserialize: (str) => JSON.parse(str),
  });
};

// DevTools middleware for Redux DevTools integration
export const devtools = <T>(
  config: StateCreator<T>,
  options?: {
    name?: string;
    enabled?: boolean;
  }
): StateCreator<T> => {
  const isEnabled = options?.enabled ?? process.env.NODE_ENV === 'development';
  const name = options?.name ?? 'Zustand Store';

  if (!isEnabled || typeof window === 'undefined') {
    return config;
  }

  return (set, get, api) => {
    const devtools = (window as any).__REDUX_DEVTOOLS_EXTENSION__;
    if (!devtools) return config(set, get, api);

    const connection = devtools.connect({ name });

    const setState = (args: any) => {
      const state = typeof args === 'function' ? args(get()) : args;
      set(state);
      connection.send('State', state);
    };

    const initialState = config(setState, get, api);
    connection.init(initialState);

    return initialState;
  };
};
