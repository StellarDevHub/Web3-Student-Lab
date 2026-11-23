# Theme System Quick Start Guide

Welcome! The Web3 Student Lab now has a complete dark/light theme system. Here's how to use it.

## 🎯 Quick Overview

The theme system automatically detects your OS theme preference (light/dark) and lets you override it with a manual toggle. All your preferences are saved!

## 🚀 Using the Theme Toggle

The theme toggle is already integrated in the navigation bar. Just click the sun/moon icon to switch between light and dark modes!

## 💻 Using the Theme in Your Components

### Getting the Current Theme

```typescript
'use client'

import { useThemeMode } from '@/hooks/useThemeMode'

export function MyComponent() {
  const { isDark, theme, toggleTheme } = useThemeMode()

  return (
    <div>
      <p>Current theme: {theme}</p>
      <p>Is dark? {isDark ? 'Yes' : 'No'}</p>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  )
}
```

### Styling with Tailwind Dark Mode

Use the `dark:` prefix for dark mode styles:

```html
<div class="bg-white text-black dark:bg-black dark:text-white">
  This content adapts to the theme
</div>
```

### Using CSS Variables

Use the pre-defined CSS variables:

```css
.card {
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}
```

Available variables:
- `--bg-primary` - Main background
- `--bg-secondary` - Secondary background
- `--bg-tertiary` - Tertiary background
- `--text-primary` - Main text
- `--text-secondary` - Secondary text
- `--border-color` - Border color

## 🔍 How It Works

1. **System Detection**: The app automatically detects your OS theme preference
2. **Manual Override**: Click the theme toggle to override the system preference
3. **Persistence**: Your choice is saved to localStorage
4. **Smooth Transitions**: Colors fade smoothly between themes
5. **Accessibility**: Keyboard accessible, screen reader support

## 📱 Available Hook Functions

```typescript
const {
  theme,           // 'light' or 'dark' - current theme
  isDark,          // boolean - is dark mode?
  isLight,         // boolean - is light mode?
  mounted,         // boolean - component hydrated?
  toggleTheme,     // () => void - switch theme
  setThemeMode,    // (theme: 'light'|'dark'|'system') => void
  colors,          // object - color palette
  chartColors,     // object - D3 chart colors
} = useThemeMode()
```

## 🔧 Advanced Usage

### Setting a Specific Theme

```typescript
const { setThemeMode } = useThemeMode()

// Force light mode
setThemeMode('light')

// Force dark mode
setThemeMode('dark')

// Use system preference
setThemeMode('system')
```

### Getting Color Values

```typescript
const { colors, chartColors } = useThemeMode()

// colors object has color definitions for styling
// chartColors object has colors optimized for D3 charts

// Example usage with D3:
const config = {
  colors: chartColors.primary,
  background: colors.bg_primary,
}
```

### Checking Hydration State

```typescript
const { mounted } = useThemeMode()

if (!mounted) {
  return <div>Loading...</div>
}

return <YourComponent />
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 📚 Full Documentation

For more detailed information, see:
- `frontend/THEME_DOCUMENTATION.md` - Complete technical documentation
- `frontend/THEME_IMPLEMENTATION_SUMMARY.md` - Implementation details
- Source code comments - JSDoc and inline explanations

## ✨ Features

✅ **System Preference Detection** - Respects OS theme setting
✅ **Manual Override** - Click to switch themes
✅ **Persistence** - Saves your preference
✅ **Smooth Transitions** - No jarring color changes
✅ **Accessibility** - WCAG 2.1 compliant
✅ **Performance** - Only ~6KB gzipped
✅ **Educational** - Detailed comments and examples

## 🔗 Real World Examples

### Toggle Button in a Card

```typescript
import { ThemeToggle } from '@/components/theme'

export function SettingsCard() {
  return (
    <div className="bg-white dark:bg-black p-4 rounded">
      <h2>Appearance</h2>
      <ThemeToggle variant="button" showLabel={true} />
    </div>
  )
}
```

### Theme-Aware Chart

```typescript
import { useThemeMode } from '@/hooks/useThemeMode'

export function MyChart() {
  const { chartColors, isDark } = useThemeMode()

  return (
    <BarChart
      data={data}
      colors={chartColors}
      background={isDark ? '#000000' : '#ffffff'}
    />
  )
}
```

### Dark Mode Support in Text

```typescript
export function DarkModeText() {
  const { isDark } = useThemeMode()

  return (
    <p className={isDark ? 'text-gray-300' : 'text-gray-700'}>
      This text adapts based on theme
    </p>
  )
}
```

## 🆘 Troubleshooting

### Theme Doesn't Persist

1. Check that localStorage is enabled in your browser
2. Check browser console for any errors
3. Verify the site isn't in private/incognito mode

### Flash of Wrong Color

This is normal during page load. The FOUC prevention script in the `<head>` should eliminate most of it. If you still see flashing:
1. Check browser cache
2. Ensure `suppressHydrationWarning` is on the `<html>` tag

### System Preference Not Detected

1. Check your OS system theme setting
2. Verify your browser supports `prefers-color-scheme` (most modern browsers do)
3. Try manually setting theme with `setThemeMode('dark')`

## 🎓 Learning Value

This theme system is great for learning:
- How to manage theme state in React
- Using React hooks effectively
- Integrating external libraries (next-themes)
- Accessibility best practices
- CSS variables and theming patterns
- Testing React components
- Handling hydration in Next.js

## 📖 More Information

Need more details? Check the main documentation:
```bash
cat frontend/THEME_DOCUMENTATION.md
```

Or look at the test files for usage examples:
```bash
# Hook tests
cat frontend/src/hooks/__tests__/useThemeMode.test.ts

# Component tests
cat frontend/src/components/theme/__tests__/ThemeToggle.test.tsx

# Integration tests
cat frontend/src/__tests__/theme-integration.test.ts
```

## ✅ Ready to Use!

The theme system is fully integrated and ready to use throughout the Web3 Student Lab. Start using `useThemeMode()` in your components today!

---

**Questions?** Check the full documentation or look at the code comments for detailed explanations.
