/**
 * React Hook for User Preferences with Local Storage Persistence
 * 
 * This hook provides a React-friendly interface for managing user preferences
 * with automatic localStorage persistence, reactivity, and accessibility support.
 * 
 * Educational Notes:
 * - Uses React hooks (useState, useEffect, useCallback) for reactivity
 * - Automatically persists changes to localStorage
 * - Provides type-safe preference access
 * - Includes proper cleanup and error handling
 * - Follows React best practices for custom hooks
 * - Supports server-side rendering (Next.js) with proper checks
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PREFERENCES,
  getPreferences,
  getPreferenceCategory,
  getStorageSize,
  resetPreferences,
  setPreferenceCategory,
  setPreferences,
  type UserPreferences,
} from '@/lib/localStorage';

/**
 * Hook return type
 */
interface UseUserPreferencesReturn {
  /** Current user preferences */
  preferences: UserPreferences;
  /** Update all preferences */
  updatePreferences: (preferences: Partial<UserPreferences>) => boolean;
  /** Update a specific preference category */
  updatePreferenceCategory: <K extends keyof UserPreferences>(
    category: K,
    value: UserPreferences[K]
  ) => boolean;
  /** Reset all preferences to defaults */
  reset: () => boolean;
  /** Get estimated storage size in bytes */
  storageSize: number;
  /** Whether preferences are loaded from storage */
  isLoaded: boolean;
  /** Whether there was an error loading preferences */
  error: Error | null;
}

/**
 * Custom hook for managing user preferences with localStorage persistence
 * 
 * This hook provides a complete solution for managing user preferences with:
 * - Automatic persistence to localStorage
 * - React state management
 * - Type-safe operations
 * - Error handling
 * - Server-side rendering support
 * 
 * @returns Object containing preferences and helper functions
 * 
 * @example
 * ```tsx
 * function SettingsPage() {
 *   const { preferences, updatePreferences, reset } = useUserPreferences();
 *   
 *   const handleThemeChange = (theme: 'light' | 'dark') => {
 *     updatePreferences({ theme });
 *   };
 *   
 *   return (
 *     <button onClick={() => reset()}>Reset to Defaults</button>
 *   );
 * }
 * ```
 */
export function useUserPreferences(): UseUserPreferencesReturn {
  const [preferences, setPreferencesState] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [storageSize, setStorageSize] = useState(0);

  /**
   * Load preferences from localStorage on mount
   * Only runs on client-side to support SSR
   */
  useEffect(() => {
    try {
      const loaded = getPreferences();
      setPreferencesState(loaded);
      setStorageSize(getStorageSize());
      setIsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load preferences'));
      setIsLoaded(true);
    }
  }, []);

  /**
   * Listen for storage changes from other tabs/windows
   * This keeps preferences in sync across browser sessions
   */
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'web3_student_lab_preferences' && event.newValue) {
        try {
          const updated = JSON.parse(event.newValue) as UserPreferences;
          setPreferencesState(updated);
          setStorageSize(getStorageSize());
        } catch (err) {
          console.warn('Failed to parse storage change event', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  /**
   * Update all preferences
   * Automatically persists to localStorage and updates React state
   */
  const updatePreferences = useCallback((newPreferences: Partial<UserPreferences>) => {
    try {
      const success = setPreferences(newPreferences);
      if (success) {
        const updated = getPreferences();
        setPreferencesState(updated);
        setStorageSize(getStorageSize());
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update preferences'));
      return false;
    }
  }, []);

  /**
   * Update a specific preference category
   * Type-safe operation using TypeScript generics
   */
  const updatePreferenceCategory = useCallback(
    <K extends keyof UserPreferences>(category: K, value: UserPreferences[K]) => {
      try {
        const success = setPreferenceCategory(category, value);
        if (success) {
          const updated = getPreferences();
          setPreferencesState(updated);
          setStorageSize(getStorageSize());
        }
        return success;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update preference category'));
        return false;
      }
    },
    []
  );

  /**
   * Reset all preferences to default values
   */
  const reset = useCallback(() => {
    try {
      const success = resetPreferences();
      if (success) {
        setPreferencesState(DEFAULT_PREFERENCES);
        setStorageSize(getStorageSize());
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to reset preferences'));
      return false;
    }
  }, []);

  return {
    preferences,
    updatePreferences,
    updatePreferenceCategory,
    reset,
    storageSize,
    isLoaded,
    error,
  };
}

/**
 * Hook for managing a single preference value
 * Useful for individual preference components
 * 
 * @param category - The preference category
 * @returns Tuple of [value, setter, isLoaded, error]
 * 
 * @example
 * ```tsx
 * function ThemeToggle() {
 *   const [theme, setTheme] = useSinglePreference('theme');
 *   
 *   return (
 *     <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
 *       Toggle Theme
 *     </button>
 *   );
 * }
 * ```
 */
export function useSinglePreference<K extends keyof UserPreferences>(
  category: K
): [UserPreferences[K], (value: UserPreferences[K]) => boolean, boolean, Error | null] {
  const { preferences, updatePreferenceCategory, isLoaded, error } = useUserPreferences();

  const setValue = useCallback(
    (value: UserPreferences[K]) => {
      return updatePreferenceCategory(category, value);
    },
    [category, updatePreferenceCategory]
  );

  return [preferences[category], setValue, isLoaded, error];
}

/**
 * Hook for managing theme preferences specifically
 * Integrates with the existing theme system
 * 
 * @returns Theme-related utilities
 * 
 * @example
 * ```tsx
 * function ThemeSelector() {
 *   const { theme, setTheme, isDark } = useThemePreferences();
 *   
 *   return (
 *     <select value={theme} onChange={(e) => setTheme(e.target.value as any)}>
 *       <option value="light">Light</option>
 *       <option value="dark">Dark</option>
 *       <option value="system">System</option>
 *     </select>
 *   );
 * }
 * ```
 */
export function useThemePreferences() {
  const [theme, setTheme, isLoaded, error] = useSinglePreference('theme');
  const [layout, setLayout] = useSinglePreference('layout');

  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const isLight = !isDark;

  return {
    theme,
    setTheme,
    layout,
    setLayout,
    isDark,
    isLight,
    isLoaded,
    error,
  };
}

/**
 * Hook for managing notification preferences
 * 
 * @returns Notification-related utilities
 * 
 * @example
 * ```tsx
 * function NotificationSettings() {
 *   const { notifications, updateNotifications } = useNotificationPreferences();
 *   
 *   return (
 *     <label>
 *       <input
 *         type="checkbox"
 *         checked={notifications.enabled}
 *         onChange={(e) => updateNotifications({ enabled: e.target.checked })}
 *       />
 *       Enable Notifications
 *     </label>
 *   );
 * }
 * ```
 */
export function useNotificationPreferences() {
  const [notifications, setNotifications, isLoaded, error] = useSinglePreference('notifications');

  const updateNotifications = useCallback(
    (updates: Partial<UserPreferences['notifications']>) => {
      return setNotifications({ ...notifications, ...updates });
    },
    [notifications, setNotifications]
  );

  return {
    notifications,
    updateNotifications,
    isLoaded,
    error,
  };
}

/**
 * Hook for managing learning settings
 * 
 * @returns Learning-related utilities
 * 
 * @example
 * ```tsx
 * function LearningSettings() {
 *   const { learning, updateLearning } = useLearningPreferences();
 *   
 *   return (
 *     <label>
 *       <input
 *         type="checkbox"
 *         checked={learning.autoPlayVideos}
 *         onChange={(e) => updateLearning({ autoPlayVideos: e.target.checked })}
 *       />
 *       Auto-play Videos
 *     </label>
 *   );
 * }
 * ```
 */
export function useLearningPreferences() {
  const [learning, setLearning, isLoaded, error] = useSinglePreference('learning');

  const updateLearning = useCallback(
    (updates: Partial<UserPreferences['learning']>) => {
      return setLearning({ ...learning, ...updates });
    },
    [learning, setLearning]
  );

  return {
    learning,
    updateLearning,
    isLoaded,
    error,
  };
}

/**
 * Hook for managing accessibility settings
 * Follows WCAG 2.1 guidelines for accessibility preferences
 * 
 * @returns Accessibility-related utilities
 * 
 * @example
 * ```tsx
 * function AccessibilitySettings() {
 *   const { accessibility, updateAccessibility } = useAccessibilityPreferences();
 *   
 *   return (
 *     <label>
 *       <input
 *         type="checkbox"
 *         checked={accessibility.reducedMotion}
 *         onChange={(e) => updateAccessibility({ reducedMotion: e.target.checked })}
 *       />
 *       Reduce Motion
 *     </label>
 *   );
 * }
 * ```
 */
export function useAccessibilityPreferences() {
  const [accessibility, setAccessibility, isLoaded, error] = useSinglePreference('accessibility');

  const updateAccessibility = useCallback(
    (updates: Partial<UserPreferences['accessibility']>) => {
      return setAccessibility({ ...accessibility, ...updates });
    },
    [accessibility, setAccessibility]
  );

  return {
    accessibility,
    updateAccessibility,
    isLoaded,
    error,
  };
}
