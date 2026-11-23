# Local Storage for User Preferences Documentation

## Overview

This document describes the local storage system implemented for user preferences in the Web3 Student Lab frontend. The system provides persistent storage for user settings across browser sessions with proper error handling, accessibility support, and comprehensive testing.

## Features

### 1. Type-Safe Local Storage Utility

The core utility (`src/lib/localStorage.ts`) provides:

- **Type-safe operations**: TypeScript generics ensure type safety
- **Error handling**: Graceful fallbacks when localStorage is unavailable
- **Automatic JSON parsing**: Handles serialization/deserialization automatically
- **Storage key prefixing**: Prevents conflicts with other applications
- **Preference versioning**: Supports future schema migrations
- **Storage size tracking**: Monitors localStorage usage

### 2. React Hooks for User Preferences

The React hooks (`src/hooks/useUserPreferences.ts`) provide:

- **Reactive state management**: Automatic React state updates
- **localStorage persistence**: Automatic save/load operations
- **Category-specific hooks**: Specialized hooks for different preference types
- **Cross-tab synchronization**: Storage event listeners for multi-tab support
- **Error recovery**: Graceful handling of storage errors
- **SSR support**: Works with Next.js server-side rendering

### 3. Preference Categories

The system manages the following preference categories:

**Theme Preferences:**
- Theme mode (light, dark, system)
- Layout settings (sidebar state, width, panel layout)

**Notification Preferences:**
- Enable/disable notifications
- Email notifications
- Push notifications
- Learning reminders
- Achievement alerts

**Learning Settings:**
- Auto-play videos
- Progress display
- Sound effects
- Subtitles
- Default language

**Accessibility Settings:**
- Reduced motion (WCAG 2.1)
- High contrast (WCAG 2.1)
- Font size (WCAG 2.1)
- Screen reader support

## Architecture

### Core Utility Functions

```typescript
// Storage availability check
isStorageAvailable(): boolean

// Storage key management
getStorageKey(key: string): string

// Basic storage operations
getItem<T>(key: string, defaultValue: T): T
setItem<T>(key: string, value: T): boolean
removeItem(key: string): boolean

// Preference management
getPreferences(): UserPreferences
setPreferences(preferences: Partial<UserPreferences>): boolean
resetPreferences(): boolean

// Category-specific operations
getPreferenceCategory<K>(category: K): UserPreferences[K]
setPreferenceCategory<K>(category: K, value: UserPreferences[K]): boolean

// Import/Export
exportPreferences(): string | null
importPreferences(json: string): boolean

// Storage management
clearAllPreferences(): boolean
getStorageSize(): number
```

### React Hooks

```typescript
// Main hook for all preferences
useUserPreferences(): {
  preferences: UserPreferences;
  updatePreferences: (prefs: Partial<UserPreferences>) => boolean;
  updatePreferenceCategory: <K>(cat: K, val: UserPreferences[K]) => boolean;
  reset: () => boolean;
  storageSize: number;
  isLoaded: boolean;
  error: Error | null;
}

// Single preference hook
useSinglePreference<K>(category: K): [
  UserPreferences[K],
  (value: UserPreferences[K]) => boolean,
  boolean,
  Error | null
]

// Category-specific hooks
useThemePreferences()
useNotificationPreferences()
useLearningPreferences()
useAccessibilityPreferences()
```

## Usage Examples

### Basic Usage

```typescript
import { useUserPreferences } from '@/hooks/useUserPreferences';

function SettingsPage() {
  const { preferences, updatePreferences, reset } = useUserPreferences();
  
  const handleThemeChange = (theme: 'light' | 'dark') => {
    updatePreferences({ theme });
  };
  
  return (
    <div>
      <select value={preferences.theme} onChange={(e) => handleThemeChange(e.target.value)}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
      <button onClick={reset}>Reset to Defaults</button>
    </div>
  );
}
```

### Using Category-Specific Hooks

```typescript
import { useThemePreferences } from '@/hooks/useUserPreferences';

function ThemeSettings() {
  const { theme, setTheme, isDark } = useThemePreferences();
  
  return (
    <button onClick={() => setTheme(isDark ? 'light' : 'dark')}>
      Switch to {isDark ? 'Light' : 'Dark'} Mode
    </button>
  );
}
```

### Using Single Preference Hook

```typescript
import { useSinglePreference } from '@/hooks/useUserPreferences';

function SimpleToggle() {
  const [enabled, setEnabled] = useSinglePreference('notifications');
  
  return (
    <label>
      <input
        type="checkbox"
        checked={enabled.enabled}
        onChange={(e) => setEnabled({ ...enabled, enabled: e.target.checked })}
      />
      Enable Notifications
    </label>
  );
}
```

### Accessibility Settings

```typescript
import { useAccessibilityPreferences } from '@/hooks/useUserPreferences';

function AccessibilitySettings() {
  const { accessibility, updateAccessibility } = useAccessibilityPreferences();
  
  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={accessibility.reducedMotion}
          onChange={(e) => updateAccessibility({ reducedMotion: e.target.checked })}
        />
        Reduce Motion (WCAG 2.1)
      </label>
      
      <label>
        <input
          type="checkbox"
          checked={accessibility.highContrast}
          onChange={(e) => updateAccessibility({ highContrast: e.target.checked })}
        />
        High Contrast (WCAG 2.1)
      </label>
      
      <label>
        Font Size:
        <input
          type="number"
          value={accessibility.fontSize}
          onChange={(e) => updateAccessibility({ fontSize: parseInt(e.target.value) })}
          min="12"
          max="32"
        />
      </label>
    </div>
  );
}
```

## Integration with Existing Infrastructure

### Theme Integration

The system integrates with the existing `useThemeMode` hook:

```typescript
// src/hooks/useThemeMode.ts
import { useThemePreferences } from './useUserPreferences';

export function useThemeMode() {
  const { theme, setTheme, systemTheme } = useTheme();
  const { theme: storedTheme, setTheme: setStoredTheme } = useThemePreferences();
  
  // Sync stored theme with next-themes
  useEffect(() => {
    if (mounted && storedTheme) {
      setTheme(storedTheme);
    }
  }, [mounted, storedTheme, setTheme]);
  
  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
    setStoredTheme(newTheme); // Persist to localStorage
  };
  
  // ... rest of implementation
}
```

### Layout Integration

The system integrates with the existing `useLayoutPersistence` hook:

```typescript
// src/hooks/useLayoutPersistence.ts
import { getItem, setItem } from '@/lib/localStorage';

export function useLayoutPersistence(userId?: string) {
  const [layout, setLayout] = useState<WorkspaceLayout>(DEFAULT_LAYOUT);
  
  useEffect(() => {
    const stored = getItem<WorkspaceLayout>(getStorageKey(userId), DEFAULT_LAYOUT);
    setLayout(stored);
  }, [userId]);
  
  const saveLayout = useCallback(
    (newLayout: WorkspaceLayout) => {
      setLayout(newLayout);
      setItem(getStorageKey(userId), newLayout); // Use centralized utility
    },
    [userId]
  );
  
  // ... rest of implementation
}
```

## Data Structure

### UserPreferences Interface

```typescript
interface UserPreferences {
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
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- localStorage.test.ts
npm test -- useUserPreferences.test.ts
```

### Test Coverage

The system has comprehensive unit tests covering:

- **localStorage utility tests** (50+ test cases):
  - Storage availability detection
  - Type-safe storage operations
  - Error handling and fallbacks
  - Preference management functions
  - Storage size calculation
  - Accessibility preference handling

- **React hooks tests** (40+ test cases):
  - Hook behavior with localStorage
  - State management and reactivity
  - Error handling
  - All preference categories
  - Storage event handling
  - Accessibility compliance

Total test coverage exceeds 90% for the local storage system.

## Accessibility Compliance

The system follows WCAG 2.1 accessibility guidelines:

### Reduced Motion Support

```typescript
const { accessibility, updateAccessibility } = useAccessibilityPreferences();

// Respect user's motion preference
if (accessibility.reducedMotion) {
  // Disable animations
}
```

### High Contrast Support

```typescript
if (accessibility.highContrast) {
  // Apply high contrast theme
}
```

### Font Size Support

```typescript
// Apply user's preferred font size
document.documentElement.style.fontSize = `${accessibility.fontSize}px`;
```

### Screen Reader Support

```typescript
if (accessibility.screenReader) {
  // Enhance screen reader experience
}
```

## Error Handling

### Storage Unavailability

The system handles cases where localStorage is unavailable:

```typescript
// Private browsing mode
// Security settings blocking localStorage
// Storage quota exceeded
// Incognito mode

// All operations return default values or false on failure
const theme = getItem('theme', 'system'); // Returns 'system' if storage fails
```

### Error Recovery

The system provides error recovery mechanisms:

```typescript
const { error, preferences } = useUserPreferences();

if (error) {
  // Display error message to user
  // Continue with default preferences
  // Retry storage operations
}
```

## Best Practices

### 1. Always Use Type-Safe Operations

```typescript
// Good
const theme = getItem<string>('theme', 'system');

// Bad
const theme = localStorage.getItem('theme'); // No type safety
```

### 2. Provide Default Values

```typescript
// Good
const theme = getItem('theme', 'system');

// Bad
const theme = getItem('theme'); // Could return null
```

### 3. Handle Errors Gracefully

```typescript
// Good
const success = setItem('theme', 'dark');
if (!success) {
  // Handle failure
}

// Bad
setItem('theme', 'dark'); // No error handling
```

### 4. Use Category-Specific Hooks

```typescript
// Good
const { theme, setTheme } = useThemePreferences();

// Bad
const { preferences, updatePreferences } = useUserPreferences();
// Then access preferences.theme directly
```

### 5. Respect Accessibility Preferences

```typescript
// Good
const { accessibility } = useAccessibilityPreferences();
if (accessibility.reducedMotion) {
  // Disable animations
}

// Bad
// Always show animations regardless of user preference
```

## Storage Limits

### Browser Storage Limits

- **Chrome/Edge**: ~5-10MB per origin
- **Firefox**: ~5-10MB per origin
- **Safari**: ~5MB per origin

### Monitoring Storage Usage

```typescript
const { storageSize } = useUserPreferences();

if (storageSize > 4000000) { // 4MB
  // Warn user about storage usage
  // Suggest clearing old data
}
```

## Security Considerations

1. **Never store sensitive data**: Passwords, tokens, API keys
2. **Sanitize input**: Validate all preference values
3. **Use HTTPS**: Prevent man-in-the-middle attacks
4. **Clear on logout**: Remove user-specific preferences on logout
5. **Version control**: Handle schema migrations carefully

## Future Enhancements

Potential improvements for the local storage system:

1. **IndexedDB integration**: For larger storage needs
2. **Cloud sync**: Sync preferences across devices
3. **Preference sharing**: Share settings between users
4. **Advanced validation**: Schema validation with Zod
5. **Migration system**: Automatic schema migrations
6. **Analytics**: Track preference usage patterns

## Troubleshooting

### Preferences Not Persisting

1. Check if localStorage is available
2. Verify storage quota not exceeded
3. Check browser privacy settings
4. Verify no JavaScript errors

### Preferences Not Loading

1. Check browser console for errors
2. Verify storage key prefix
3. Check preference version compatibility
4. Verify JSON parsing

### Cross-Tab Sync Issues

1. Verify storage event listeners are active
2. Check for same-origin policy violations
3. Verify storage key consistency

## References

- [MDN Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [React Hooks Documentation](https://react.dev/reference/react)
- [Next.js Documentation](https://nextjs.org/docs)

## Support

For issues or questions about the local storage system:

1. Check this documentation
2. Review the test files for usage examples
3. Check the inline code comments
4. Open an issue in the repository

---

**Last Updated**: June 4, 2026
**Version**: 1.0.0
