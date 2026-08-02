'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * ThemeProvider Component (Deprecated)
 *
 * @deprecated Use the next-themes provider in /lib/theme/providers.tsx instead.
 * This provider is maintained for backward compatibility but should not be used
 * for new features. Use the `useThemeMode` hook instead.
 *
 * Provides theme context to the application, enabling theme switching and
 * system preference detection. Integrates with next-themes for optimal performance.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Theme provider wrapper
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    // Read the current theme from HTML class or localStorage on mount
    const root = window.document.documentElement;
    const isDark = root.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const root = window.document.documentElement;
    const newTheme = theme === 'dark' ? 'light' : 'dark';

    // Instant DOM update
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    localStorage.setItem('theme', newTheme);
    setTheme(newTheme);
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

/**
 * useTheme Hook (Deprecated)
 *
 * @deprecated Use useThemeMode() from '@/hooks/useThemeMode' instead.
 *
 * Access theme context. Should only be used in legacy code.
 * New code should use the useThemeMode hook which provides better
 * system preference detection and theme management.
 *
 * @throws {Error} If used outside of ThemeProvider
 * @returns {ThemeContextType} Theme context object with theme and toggleTheme
 *
 * @example
 * const { theme, toggleTheme } = useTheme(); // Deprecated
 * const { theme, isDark, toggleTheme } = useThemeMode(); // Recommended
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
