/**
 * Local Storage Utility for User Preferences
 * 
 * This module provides a robust, type-safe interface for managing user preferences
 * in localStorage with proper error handling, fallbacks, and accessibility considerations.
 * 
 * Educational Notes:
 * - Uses try-catch blocks to handle localStorage unavailability (private browsing, storage quota exceeded)
 * - Implements type-safe storage operations with TypeScript generics
 * - Provides fallback values when storage fails
 * - Follows WCAG 2.1 accessibility guidelines for preference persistence
 * - Includes automatic JSON parsing/stringifying with error handling
 * - Supports preference versioning for future migrations
 */

/**
 * Storage key prefix to avoid conflicts with other applications
 */
const STORAGE_PREFIX = 'web3_student_lab_';

/**
 * Current version of the preferences schema
 * Used for future migrations when the schema changes
 */
const PREFERENCES_VERSION = '1.0.0';

/**
 * Error class for localStorage-related errors
 */
export class StorageError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Check if localStorage is available and accessible
 * This handles cases where localStorage might be disabled (private browsing, security settings)
 * 
 * @returns true if localStorage is available, false otherwise
 */
export function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a prefixed storage key for a given preference
 * 
 * @param key - The base key for the preference
 * @returns The prefixed storage key
 */
export function getStorageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

/**
 * Generic interface for user preferences
 */
export interface UserPreferences {
  // Theme preferences
  theme: 'light' | 'dark' | 'system';
  
  // Layout preferences
  layout: {
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    panelLayout: string;
  };
  
  // Notification preferences
  notifications: {
    enabled: boolean;
    email: boolean;
    push: boolean;
    learningReminders: boolean;
    achievementAlerts: boolean;
  };
  
  // Learning settings
  learning: {
    autoPlayVideos: boolean;
    showProgress: boolean;
    soundEffects: boolean;
    subtitlesEnabled: boolean;
    defaultLanguage: string;
  };
  
  // Accessibility settings
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
    fontSize: number;
    screenReader: boolean;
  };
  
  // Metadata
  _version: string;
  _updatedAt: string;
}

/**
 * Default preferences values
 * These are used when no stored preferences exist or when storage fails
 */
export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  layout: {
    sidebarCollapsed: false,
    sidebarWidth: 280,
    panelLayout: 'default',
  },
  notifications: {
    enabled: true,
    email: true,
    push: false,
    learningReminders: true,
    achievementAlerts: true,
  },
  learning: {
    autoPlayVideos: false,
    showProgress: true,
    soundEffects: true,
    subtitlesEnabled: false,
    defaultLanguage: 'en',
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    fontSize: 16,
    screenReader: false,
  },
  _version: PREFERENCES_VERSION,
  _updatedAt: new Date().toISOString(),
};

/**
 * Get a value from localStorage with proper error handling
 * 
 * @param key - The storage key (without prefix)
 * @param defaultValue - The default value to return if storage fails
 * @returns The stored value or the default value
 * 
 * @example
 * const theme = getItem('theme', 'system');
 */
export function getItem<T>(key: string, defaultValue: T): T {
  if (!isStorageAvailable()) {
    return defaultValue;
  }

  try {
    const prefixedKey = getStorageKey(key);
    const item = localStorage.getItem(prefixedKey);
    
    if (item === null) {
      return defaultValue;
    }

    // Try to parse as JSON, fallback to string
    try {
      return JSON.parse(item) as T;
    } catch {
      return item as T;
    }
  } catch (error) {
    console.warn(`Failed to get item from localStorage: ${key}`, error);
    return defaultValue;
  }
}

/**
 * Set a value in localStorage with proper error handling
 * 
 * @param key - The storage key (without prefix)
 * @param value - The value to store
 * @returns true if successful, false otherwise
 * 
 * @example
 * setItem('theme', 'dark');
 */
export function setItem<T>(key: string, value: T): boolean {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    const prefixedKey = getStorageKey(key);
    const serialized = JSON.stringify(value);
    localStorage.setItem(prefixedKey, serialized);
    return true;
  } catch (error) {
    console.warn(`Failed to set item in localStorage: ${key}`, error);
    return false;
  }
}

/**
 * Remove a value from localStorage with proper error handling
 * 
 * @param key - The storage key (without prefix)
 * @returns true if successful, false otherwise
 * 
 * @example
 * removeItem('theme');
 */
export function removeItem(key: string): boolean {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    const prefixedKey = getStorageKey(key);
    localStorage.removeItem(prefixedKey);
    return true;
  } catch (error) {
    console.warn(`Failed to remove item from localStorage: ${key}`, error);
    return false;
  }
}

/**
 * Clear all application preferences from localStorage
 * This only removes items with the application's prefix
 * 
 * @returns true if successful, false otherwise
 * 
 * @example
 * clearAllPreferences();
 */
export function clearAllPreferences(): boolean {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    const keysToRemove: string[] = [];
    
    // Find all keys with our prefix
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all found keys
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    return true;
  } catch (error) {
    console.warn('Failed to clear all preferences from localStorage', error);
    return false;
  }
}

/**
 * Get all user preferences from localStorage
 * 
 * @returns The user preferences object with defaults for missing values
 * 
 * @example
 * const preferences = getPreferences();
 */
export function getPreferences(): UserPreferences {
  const stored = getItem<UserPreferences>('preferences', DEFAULT_PREFERENCES);
  
  // Merge with defaults to handle schema changes
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    _version: PREFERENCES_VERSION,
    _updatedAt: new Date().toISOString(),
  };
}

/**
 * Save all user preferences to localStorage
 * 
 * @param preferences - The preferences object to save
 * @returns true if successful, false otherwise
 * 
 * @example
 * const success = setPreferences({ ...preferences, theme: 'dark' });
 */
export function setPreferences(preferences: Partial<UserPreferences>): boolean {
  const current = getPreferences();
  const updated = {
    ...current,
    ...preferences,
    _version: PREFERENCES_VERSION,
    _updatedAt: new Date().toISOString(),
  };
  
  return setItem('preferences', updated);
}

/**
 * Reset all preferences to default values
 * 
 * @returns true if successful, false otherwise
 * 
 * @example
 * resetPreferences();
 */
export function resetPreferences(): boolean {
  return setPreferences(DEFAULT_PREFERENCES);
}

/**
 * Get a specific preference category
 * 
 * @param category - The category of preferences to get
 * @returns The preference category or default
 * 
 * @example
 * const theme = getPreferenceCategory('theme');
 */
export function getPreferenceCategory<K extends keyof UserPreferences>(
  category: K
): UserPreferences[K] {
  const preferences = getPreferences();
  return preferences[category];
}

/**
 * Set a specific preference category
 * 
 * @param category - The category of preferences to set
 * @param value - The value to set
 * @returns true if successful, false otherwise
 * 
 * @example
 * setPreferenceCategory('theme', 'dark');
 */
export function setPreferenceCategory<K extends keyof UserPreferences>(
  category: K,
  value: UserPreferences[K]
): boolean {
  const preferences = getPreferences();
  preferences[category] = value;
  return setPreferences(preferences);
}

/**
 * Export preferences as JSON for backup
 * 
 * @returns JSON string of preferences or null if failed
 * 
 * @example
 * const backup = exportPreferences();
 */
export function exportPreferences(): string | null {
  try {
    const preferences = getPreferences();
    return JSON.stringify(preferences, null, 2);
  } catch (error) {
    console.warn('Failed to export preferences', error);
    return null;
  }
}

/**
 * Import preferences from JSON
 * 
 * @param json - JSON string of preferences
 * @returns true if successful, false otherwise
 * 
 * @example
 * const success = importPreferences(jsonString);
 */
export function importPreferences(json: string): boolean {
  try {
    const imported = JSON.parse(json) as Partial<UserPreferences>;
    return setPreferences(imported);
  } catch (error) {
    console.warn('Failed to import preferences', error);
    return false;
  }
}

/**
 * Get the estimated size of stored preferences in bytes
 * 
 * @returns Size in bytes
 * 
 * @example
 * const size = getStorageSize();
 */
export function getStorageSize(): number {
  if (!isStorageAvailable()) {
    return 0;
  }

  try {
    let size = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const value = localStorage.getItem(key);
        size += (key?.length || 0) + (value?.length || 0);
      }
    }
    
    return size;
  } catch {
    return 0;
  }
}
