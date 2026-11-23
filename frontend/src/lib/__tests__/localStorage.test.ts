/**
 * Comprehensive Unit Tests for Local Storage Utility
 * 
 * This test suite covers the localStorage utility functions with comprehensive
 * coverage of error handling, edge cases, and accessibility considerations.
 * 
 * Educational Notes:
 * - Tests verify localStorage availability detection
 * - Tests validate type-safe storage operations
 * - Tests ensure proper error handling and fallbacks
 * - Tests cover preference management functions
 * - Tests verify storage size calculation
 * - Tests include accessibility-related preference handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isStorageAvailable,
  getStorageKey,
  getItem,
  setItem,
  removeItem,
  clearAllPreferences,
  getPreferences,
  setPreferences,
  resetPreferences,
  getPreferenceCategory,
  setPreferenceCategory,
  exportPreferences,
  importPreferences,
  getStorageSize,
  DEFAULT_PREFERENCES,
  type UserPreferences,
  StorageError,
} from '../localStorage';

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

// Setup and teardown
beforeEach(() => {
  mockLocalStorage.clear();
  // Mock window.localStorage
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  mockLocalStorage.clear();
});

describe('Storage Availability', () => {
  it('should return true when localStorage is available', () => {
    expect(isStorageAvailable()).toBe(true);
  });

  it('should return false when window is undefined', () => {
    const originalWindow = global.window;
    // @ts-ignore - intentionally removing window for test
    delete global.window;
    
    expect(isStorageAvailable()).toBe(false);
    
    global.window = originalWindow;
  });

  it('should return false when localStorage throws error', () => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage disabled');
      },
    });
    
    expect(isStorageAvailable()).toBe(false);
  });
});

describe('Storage Key Management', () => {
  it('should prefix storage keys correctly', () => {
    expect(getStorageKey('theme')).toBe('web3_student_lab_theme');
    expect(getStorageKey('preferences')).toBe('web3_student_lab_preferences');
    expect(getStorageKey('layout')).toBe('web3_student_lab_layout');
  });
});

describe('Get Item', () => {
  it('should return stored value', () => {
    mockLocalStorage.setItem('web3_student_lab_test', JSON.stringify('value'));
    const result = getItem('test', 'default');
    expect(result).toBe('value');
  });

  it('should return default value when key does not exist', () => {
    const result = getItem('nonexistent', 'default');
    expect(result).toBe('default');
  });

  it('should return default value when storage is unavailable', () => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage disabled');
      },
    });
    
    const result = getItem('test', 'default');
    expect(result).toBe('default');
  });

  it('should parse JSON values correctly', () => {
    const object = { key: 'value', number: 123 };
    mockLocalStorage.setItem('web3_student_lab_test', JSON.stringify(object));
    const result = getItem('test', null);
    expect(result).toEqual(object);
  });

  it('should handle string values', () => {
    mockLocalStorage.setItem('web3_student_lab_test', 'string value');
    const result = getItem('test', 'default');
    expect(result).toBe('string value');
  });

  it('should handle invalid JSON gracefully', () => {
    mockLocalStorage.setItem('web3_student_lab_test', 'invalid json');
    const result = getItem('test', 'default');
    expect(result).toBe('invalid json');
  });
});

describe('Set Item', () => {
  it('should store value successfully', () => {
    const result = setItem('test', 'value');
    expect(result).toBe(true);
    expect(mockLocalStorage.store['web3_student_lab_test']).toBe(JSON.stringify('value'));
  });

  it('should store objects as JSON', () => {
    const object = { key: 'value' };
    const result = setItem('test', object);
    expect(result).toBe(true);
    expect(mockLocalStorage.store['web3_student_lab_test']).toBe(JSON.stringify(object));
  });

  it('should return false when storage is unavailable', () => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage disabled');
      },
    });
    
    const result = setItem('test', 'value');
    expect(result).toBe(false);
  });
});

describe('Remove Item', () => {
  it('should remove item successfully', () => {
    mockLocalStorage.setItem('web3_student_lab_test', 'value');
    const result = removeItem('test');
    expect(result).toBe(true);
    expect(mockLocalStorage.store['web3_student_lab_test']).toBeUndefined();
  });

  it('should return false when storage is unavailable', () => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage disabled');
      },
    });
    
    const result = removeItem('test');
    expect(result).toBe(false);
  });
});

describe('Clear All Preferences', () => {
  it('should clear all prefixed items', () => {
    mockLocalStorage.setItem('web3_student_lab_theme', 'dark');
    mockLocalStorage.setItem('web3_student_lab_preferences', '{}');
    mockLocalStorage.setItem('other_key', 'value');
    
    const result = clearAllPreferences();
    expect(result).toBe(true);
    expect(mockLocalStorage.store['web3_student_lab_theme']).toBeUndefined();
    expect(mockLocalStorage.store['web3_student_lab_preferences']).toBeUndefined();
    expect(mockLocalStorage.store['other_key']).toBe('value');
  });

  it('should return false when storage is unavailable', () => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage disabled');
      },
    });
    
    const result = clearAllPreferences();
    expect(result).toBe(false);
  });
});

describe('Get Preferences', () => {
  it('should return default preferences when none stored', () => {
    const result = getPreferences();
    expect(result).toEqual(DEFAULT_PREFERENCES);
  });

  it('should return stored preferences', () => {
    const customPreferences: Partial<UserPreferences> = {
      theme: 'light',
      layout: {
        ...DEFAULT_PREFERENCES.layout,
        sidebarCollapsed: true,
      },
    };
    mockLocalStorage.setItem('web3_student_lab_preferences', JSON.stringify(customPreferences));
    
    const result = getPreferences();
    expect(result.theme).toBe('light');
    expect(result.layout.sidebarCollapsed).toBe(true);
  });

  it('should merge with defaults for missing fields', () => {
    const partialPreferences = {
      theme: 'light',
    };
    mockLocalStorage.setItem('web3_student_lab_preferences', JSON.stringify(partialPreferences));
    
    const result = getPreferences();
    expect(result.theme).toBe('light');
    expect(result.layout).toEqual(DEFAULT_PREFERENCES.layout);
    expect(result.notifications).toEqual(DEFAULT_PREFERENCES.notifications);
  });

  it('should update version and timestamp', () => {
    mockLocalStorage.setItem('web3_student_lab_preferences', JSON.stringify({ theme: 'light' }));
    
    const result = getPreferences();
    expect(result._version).toBe('1.0.0');
    expect(result._updatedAt).toBeDefined();
  });
});

describe('Set Preferences', () => {
  it('should update preferences successfully', () => {
    const result = setPreferences({ theme: 'light' });
    expect(result).toBe(true);
    
    const stored = JSON.parse(mockLocalStorage.store['web3_student_lab_preferences']);
    expect(stored.theme).toBe('light');
  });

  it('should merge with existing preferences', () => {
    setPreferences({ theme: 'light' });
    setPreferences({ layout: { ...DEFAULT_PREFERENCES.layout, sidebarCollapsed: true } });
    
    const stored = JSON.parse(mockLocalStorage.store['web3_student_lab_preferences']);
    expect(stored.theme).toBe('light');
    expect(stored.layout.sidebarCollapsed).toBe(true);
  });

  it('should update version and timestamp', () => {
    setPreferences({ theme: 'light' });
    
    const stored = JSON.parse(mockLocalStorage.store['web3_student_lab_preferences']);
    expect(stored._version).toBe('1.0.0');
    expect(stored._updatedAt).toBeDefined();
  });
});

describe('Reset Preferences', () => {
  it('should reset to default preferences', () => {
    setPreferences({ theme: 'light' });
    const result = resetPreferences();
    expect(result).toBe(true);
    
    const stored = JSON.parse(mockLocalStorage.store['web3_student_lab_preferences']);
    expect(stored).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('Get Preference Category', () => {
  it('should return specific category', () => {
    setPreferences({ theme: 'light' });
    const result = getPreferenceCategory('theme');
    expect(result).toBe('light');
  });

  it('should return default for missing category', () => {
    const result = getPreferenceCategory('theme');
    expect(result).toBe(DEFAULT_PREFERENCES.theme);
  });
});

describe('Set Preference Category', () => {
  it('should set specific category', () => {
    const result = setPreferenceCategory('theme', 'light');
    expect(result).toBe(true);
    
    const stored = JSON.parse(mockLocalStorage.store['web3_student_lab_preferences']);
    expect(stored.theme).toBe('light');
  });
});

describe('Export Preferences', () => {
  it('should export preferences as JSON string', () => {
    setPreferences({ theme: 'light' });
    const result = exportPreferences();
    
    expect(result).toBeDefined();
    const parsed = JSON.parse(result!);
    expect(parsed.theme).toBe('light');
  });

  it('should return null on error', () => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage disabled');
      },
    });
    
    const result = exportPreferences();
    expect(result).toBeNull();
  });
});

describe('Import Preferences', () => {
  it('should import preferences from JSON', () => {
    const json = JSON.stringify({ theme: 'light' });
    const result = importPreferences(json);
    expect(result).toBe(true);
    
    const stored = JSON.parse(mockLocalStorage.store['web3_student_lab_preferences']);
    expect(stored.theme).toBe('light');
  });

  it('should return false for invalid JSON', () => {
    const result = importPreferences('invalid json');
    expect(result).toBe(false);
  });
});

describe('Get Storage Size', () => {
  it('should calculate storage size correctly', () => {
    mockLocalStorage.setItem('web3_student_lab_test', 'value');
    const size = getStorageSize();
    expect(size).toBeGreaterThan(0);
  });

  it('should return 0 when storage is unavailable', () => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage disabled');
      },
    });
    
    const size = getStorageSize();
    expect(size).toBe(0);
  });

  it('should only count prefixed keys', () => {
    mockLocalStorage.setItem('web3_student_lab_test', 'value');
    mockLocalStorage.setItem('other_key', 'value');
    
    const size = getStorageSize();
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(100); // Should not include other_key
  });
});

describe('Accessibility Preferences', () => {
  it('should store accessibility settings', () => {
    const accessibilitySettings = {
      reducedMotion: true,
      highContrast: false,
      fontSize: 18,
      screenReader: false,
    };
    
    setPreferences({ accessibility: accessibilitySettings });
    const result = getPreferenceCategory('accessibility');
    expect(result).toEqual(accessibilitySettings);
  });

  it('should handle WCAG 2.1 compliant settings', () => {
    const wcagSettings = {
      reducedMotion: true, // WCAG 2.1
      highContrast: true, // WCAG 2.1
      fontSize: 20, // WCAG 2.1 (200% zoom)
      screenReader: true,
    };
    
    setPreferences({ accessibility: wcagSettings });
    const result = getPreferenceCategory('accessibility');
    expect(result.reducedMotion).toBe(true);
    expect(result.highContrast).toBe(true);
  });
});

describe('Learning Preferences', () => {
  it('should store learning settings', () => {
    const learningSettings = {
      autoPlayVideos: true,
      showProgress: true,
      soundEffects: false,
      subtitlesEnabled: true,
      defaultLanguage: 'es',
    };
    
    setPreferences({ learning: learningSettings });
    const result = getPreferenceCategory('learning');
    expect(result).toEqual(learningSettings);
  });
});

describe('Notification Preferences', () => {
  it('should store notification settings', () => {
    const notificationSettings = {
      enabled: true,
      email: false,
      push: true,
      learningReminders: true,
      achievementAlerts: false,
    };
    
    setPreferences({ notifications: notificationSettings });
    const result = getPreferenceCategory('notifications');
    expect(result).toEqual(notificationSettings);
  });
});

describe('Layout Preferences', () => {
  it('should store layout settings', () => {
    const layoutSettings = {
      sidebarCollapsed: true,
      sidebarWidth: 300,
      panelLayout: 'custom',
    };
    
    setPreferences({ layout: layoutSettings });
    const result = getPreferenceCategory('layout');
    expect(result).toEqual(layoutSettings);
  });
});

describe('Error Handling', () => {
  it('should handle quota exceeded errors', () => {
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = () => {
      throw new DOMException('QuotaExceededError');
    };
    
    const result = setItem('test', 'value');
    expect(result).toBe(false);
    
    mockLocalStorage.setItem = originalSetItem;
  });

  it('should handle security errors', () => {
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = () => {
      throw new DOMException('SecurityError');
    };
    
    const result = setItem('test', 'value');
    expect(result).toBe(false);
    
    mockLocalStorage.setItem = originalSetItem;
  });
});
