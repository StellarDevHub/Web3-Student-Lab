/**
 * Comprehensive Unit Tests for User Preferences Hook
 * 
 * This test suite covers the React hooks for managing user preferences
 * with localStorage persistence, reactivity, and accessibility support.
 * 
 * Educational Notes:
 * - Tests verify React hook behavior with localStorage
 * - Tests validate state management and reactivity
 * - Tests ensure proper error handling
 * - Tests cover all preference categories
 * - Tests verify storage event handling
 * - Tests include accessibility-related preference handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useUserPreferences,
  useSinglePreference,
  useThemePreferences,
  useNotificationPreferences,
  useLearningPreferences,
  useAccessibilityPreferences,
} from '../useUserPreferences';
import {
  DEFAULT_PREFERENCES,
  setItem,
  getItem,
  clearAllPreferences,
} from '@/lib/localStorage';

// Mock localStorage
const mockLocalStorage = {
  store: {} as Record<string, string>,
  getItem: (key: string) => mockLocalStorage.store[key] || null,
  setItem: (key: string, value: string) => {
    mockLocalStorage.store[key] = value;
  },
  removeItem: (key: string) => {
    delete mockLocalStorage.store[key];
  },
  clear: () => {
    mockLocalStorage.store = {};
  },
  get length() {
    return Object.keys(mockLocalStorage.store).length;
  },
  key: (index: number) => Object.keys(mockLocalStorage.store)[index] || null,
};

// Mock window and localStorage
beforeEach(() => {
  mockLocalStorage.clear();
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  mockLocalStorage.clear();
  vi.restoreAllMocks();
});

describe('useUserPreferences', () => {
  it('should load default preferences on mount', () => {
    const { result } = renderHook(() => useUserPreferences());
    
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('should load stored preferences on mount', () => {
    const customPreferences = {
      ...DEFAULT_PREFERENCES,
      theme: 'light',
    };
    setItem('preferences', customPreferences);
    
    const { result } = renderHook(() => useUserPreferences());
    
    expect(result.current.preferences.theme).toBe('light');
  });

  it('should update preferences', async () => {
    const { result } = renderHook(() => useUserPreferences());
    
    act(() => {
      result.current.updatePreferences({ theme: 'light' });
    });
    
    await waitFor(() => {
      expect(result.current.preferences.theme).toBe('light');
    });
  });

  it('should update preference category', async () => {
    const { result } = renderHook(() => useUserPreferences());
    
    act(() => {
      result.current.updatePreferenceCategory('theme', 'light');
    });
    
    await waitFor(() => {
      expect(result.current.preferences.theme).toBe('light');
    });
  });

  it('should reset preferences to defaults', async () => {
    const { result } = renderHook(() => useUserPreferences());
    
    act(() => {
      result.current.updatePreferences({ theme: 'light' });
    });
    
    await waitFor(() => {
      expect(result.current.preferences.theme).toBe('light');
    });
    
    act(() => {
      result.current.reset();
    });
    
    await waitFor(() => {
      expect(result.current.preferences.theme).toBe(DEFAULT_PREFERENCES.theme);
    });
  });

  it('should set isLoaded to true after loading', async () => {
    const { result } = renderHook(() => useUserPreferences());
    
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
  });

  it('should handle storage errors gracefully', async () => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage disabled');
      },
    });
    
    const { result } = renderHook(() => useUserPreferences());
    
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
      expect(result.current.isLoaded).toBe(true);
    });
  });

  it('should calculate storage size', async () => {
    const { result } = renderHook(() => useUserPreferences());
    
    act(() => {
      result.current.updatePreferences({ theme: 'light' });
    });
    
    await waitFor(() => {
      expect(result.current.storageSize).toBeGreaterThan(0);
    });
  });

  it('should listen for storage changes from other tabs', async () => {
    const { result } = renderHook(() => useUserPreferences());
    
    act(() => {
      result.current.updatePreferences({ theme: 'light' });
    });
    
    await waitFor(() => {
      expect(result.current.preferences.theme).toBe('light');
    });
    
    // Simulate storage event from another tab
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'web3_student_lab_preferences',
        newValue: JSON.stringify({ ...DEFAULT_PREFERENCES, theme: 'dark' }),
        oldValue: JSON.stringify({ ...DEFAULT_PREFERENCES, theme: 'light' }),
      }));
    });
    
    await waitFor(() => {
      expect(result.current.preferences.theme).toBe('dark');
    });
  });
});

describe('useSinglePreference', () => {
  it('should return single preference value', async () => {
    const { result } = renderHook(() => useSinglePreference('theme'));
    
    await waitFor(() => {
      expect(result.current[0]).toBe(DEFAULT_PREFERENCES.theme);
    });
  });

  it('should update single preference value', async () => {
    const { result } = renderHook(() => useSinglePreference('theme'));
    
    act(() => {
      result.current[1]('light');
    });
    
    await waitFor(() => {
      expect(result.current[0]).toBe('light');
    });
  });

  it('should return isLoaded status', async () => {
    const { result } = renderHook(() => useSinglePreference('theme'));
    
    await waitFor(() => {
      expect(result.current[2]).toBe(true);
    });
  });

  it('should return error status', async () => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage disabled');
      },
    });
    
    const { result } = renderHook(() => useSinglePreference('theme'));
    
    await waitFor(() => {
      expect(result.current[3]).not.toBeNull();
    });
  });
});

describe('useThemePreferences', () => {
  it('should return theme preferences', async () => {
    const { result } = renderHook(() => useThemePreferences());
    
    await waitFor(() => {
      expect(result.current.theme).toBeDefined();
      expect(result.current.layout).toBeDefined();
    });
  });

  it('should update theme', async () => {
    const { result } = renderHook(() => useThemePreferences());
    
    act(() => {
      result.current.setTheme('light');
    });
    
    await waitFor(() => {
      expect(result.current.theme).toBe('light');
    });
  });

  it('should update layout', async () => {
    const { result } = renderHook(() => useThemePreferences());
    
    const newLayout = {
      ...DEFAULT_PREFERENCES.layout,
      sidebarCollapsed: true,
    };
    
    act(() => {
      result.current.setLayout(newLayout);
    });
    
    await waitFor(() => {
      expect(result.current.layout.sidebarCollapsed).toBe(true);
    });
  });

  it('should determine dark mode correctly', async () => {
    const { result } = renderHook(() => useThemePreferences());
    
    act(() => {
      result.current.setTheme('dark');
    });
    
    await waitFor(() => {
      expect(result.current.isDark).toBe(true);
      expect(result.current.isLight).toBe(false);
    });
  });

  it('should determine light mode correctly', async () => {
    const { result } = renderHook(() => useThemePreferences());
    
    act(() => {
      result.current.setTheme('light');
    });
    
    await waitFor(() => {
      expect(result.current.isDark).toBe(false);
      expect(result.current.isLight).toBe(true);
    });
  });

  it('should respect system preference for theme', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    
    const { result } = renderHook(() => useThemePreferences());
    
    act(() => {
      result.current.setTheme('system');
    });
    
    await waitFor(() => {
      expect(result.current.isDark).toBe(true);
    });
  });
});

describe('useNotificationPreferences', () => {
  it('should return notification preferences', async () => {
    const { result } = renderHook(() => useNotificationPreferences());
    
    await waitFor(() => {
      expect(result.current.notifications).toEqual(DEFAULT_PREFERENCES.notifications);
    });
  });

  it('should update notification preferences', async () => {
    const { result } = renderHook(() => useNotificationPreferences());
    
    act(() => {
      result.current.updateNotifications({ enabled: false });
    });
    
    await waitFor(() => {
      expect(result.current.notifications.enabled).toBe(false);
    });
  });

  it('should merge notification updates', async () => {
    const { result } = renderHook(() => useNotificationPreferences());
    
    act(() => {
      result.current.updateNotifications({ enabled: false });
    });
    
    await waitFor(() => {
      expect(result.current.notifications.enabled).toBe(false);
    });
    
    act(() => {
      result.current.updateNotifications({ email: false });
    });
    
    await waitFor(() => {
      expect(result.current.notifications.enabled).toBe(false);
      expect(result.current.notifications.email).toBe(false);
    });
  });
});

describe('useLearningPreferences', () => {
  it('should return learning preferences', async () => {
    const { result } = renderHook(() => useLearningPreferences());
    
    await waitFor(() => {
      expect(result.current.learning).toEqual(DEFAULT_PREFERENCES.learning);
    });
  });

  it('should update learning preferences', async () => {
    const { result } = renderHook(() => useLearningPreferences());
    
    act(() => {
      result.current.updateLearning({ autoPlayVideos: true });
    });
    
    await waitFor(() => {
      expect(result.current.learning.autoPlayVideos).toBe(true);
    });
  });

  it('should merge learning updates', async () => {
    const { result } = renderHook(() => useLearningPreferences());
    
    act(() => {
      result.current.updateLearning({ autoPlayVideos: true });
    });
    
    await waitFor(() => {
      expect(result.current.learning.autoPlayVideos).toBe(true);
    });
    
    act(() => {
      result.current.updateLearning({ showProgress: false });
    });
    
    await waitFor(() => {
      expect(result.current.learning.autoPlayVideos).toBe(true);
      expect(result.current.learning.showProgress).toBe(false);
    });
  });
});

describe('useAccessibilityPreferences', () => {
  it('should return accessibility preferences', async () => {
    const { result } = renderHook(() => useAccessibilityPreferences());
    
    await waitFor(() => {
      expect(result.current.accessibility).toEqual(DEFAULT_PREFERENCES.accessibility);
    });
  });

  it('should update accessibility preferences', async () => {
    const { result } = renderHook(() => useAccessibilityPreferences());
    
    act(() => {
      result.current.updateAccessibility({ reducedMotion: true });
    });
    
    await waitFor(() => {
      expect(result.current.accessibility.reducedMotion).toBe(true);
    });
  });

  it('should merge accessibility updates', async () => {
    const { result } = renderHook(() => useAccessibilityPreferences());
    
    act(() => {
      result.current.updateAccessibility({ reducedMotion: true });
    });
    
    await waitFor(() => {
      expect(result.current.accessibility.reducedMotion).toBe(true);
    });
    
    act(() => {
      result.current.updateAccessibility({ highContrast: true });
    });
    
    await waitFor(() => {
      expect(result.current.accessibility.reducedMotion).toBe(true);
      expect(result.current.accessibility.highContrast).toBe(true);
    });
  });

  it('should handle WCAG 2.1 compliant settings', async () => {
    const { result } = renderHook(() => useAccessibilityPreferences());
    
    const wcagSettings = {
      reducedMotion: true,
      highContrast: true,
      fontSize: 20,
      screenReader: true,
    };
    
    act(() => {
      result.current.updateAccessibility(wcagSettings);
    });
    
    await waitFor(() => {
      expect(result.current.accessibility).toEqual(wcagSettings);
    });
  });
});

describe('Integration Tests', () => {
  it('should persist preferences across hook instances', async () => {
    const { result: result1 } = renderHook(() => useUserPreferences());
    
    act(() => {
      result1.current.updatePreferences({ theme: 'light' });
    });
    
    await waitFor(() => {
      expect(result1.current.preferences.theme).toBe('light');
    });
    
    // Unmount first hook
    result1.current;
    
    // Mount new hook instance
    const { result: result2 } = renderHook(() => useUserPreferences());
    
    await waitFor(() => {
      expect(result2.current.preferences.theme).toBe('light');
    });
  });

  it('should sync preferences between different category hooks', async () => {
    const { result: themeResult } = renderHook(() => useThemePreferences());
    const { result: singleResult } = renderHook(() => useSinglePreference('theme'));
    
    act(() => {
      themeResult.current.setTheme('light');
    });
    
    await waitFor(() => {
      expect(themeResult.current.theme).toBe('light');
      expect(singleResult.current[0]).toBe('light');
    });
  });

  it('should handle rapid updates correctly', async () => {
    const { result } = renderHook(() => useUserPreferences());
    
    act(() => {
      result.current.updatePreferences({ theme: 'light' });
      result.current.updatePreferences({ theme: 'dark' });
      result.current.updatePreferences({ theme: 'light' });
    });
    
    await waitFor(() => {
      expect(result.current.preferences.theme).toBe('light');
    });
  });
});

describe('Error Recovery', () => {
  it('should recover from storage errors', async () => {
    const { result } = renderHook(() => useUserPreferences());
    
    // Simulate storage error
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage disabled');
      },
    });
    
    act(() => {
      result.current.updatePreferences({ theme: 'light' });
    });
    
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    
    // Restore storage
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
    
    // Try again
    act(() => {
      result.current.updatePreferences({ theme: 'dark' });
    });
    
    await waitFor(() => {
      expect(result.current.preferences.theme).toBe('dark');
    });
  });
});

describe('Accessibility Compliance', () => {
  it('should support reduced motion preference', async () => {
    const { result } = renderHook(() => useAccessibilityPreferences());
    
    act(() => {
      result.current.updateAccessibility({ reducedMotion: true });
    });
    
    await waitFor(() => {
      expect(result.current.accessibility.reducedMotion).toBe(true);
    });
  });

  it('should support high contrast preference', async () => {
    const { result } = renderHook(() => useAccessibilityPreferences());
    
    act(() => {
      result.current.updateAccessibility({ highContrast: true });
    });
    
    await waitFor(() => {
      expect(result.current.accessibility.highContrast).toBe(true);
    });
  });

  it('should support custom font size', async () => {
    const { result } = renderHook(() => useAccessibilityPreferences());
    
    act(() => {
      result.current.updateAccessibility({ fontSize: 24 });
    });
    
    await waitFor(() => {
      expect(result.current.accessibility.fontSize).toBe(24);
    });
  });
});
