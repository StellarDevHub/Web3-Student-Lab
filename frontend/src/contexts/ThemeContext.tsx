'use client';

import { getPreferences, setPreferenceCategory } from '@/lib/localStorage';
import { getThemeColors, getThemeStyles, type ThemeName } from '@/lib/theme/themeColors';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Theme = 'dark' | 'light' | 'high-contrast';

const HIGH_CONTRAST_STORAGE_KEY = 'web3-lab-high-contrast';

export interface ThemeContextType {
  theme: Theme;
  isHighContrast: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setHighContrast: (enabled: boolean) => void;
  toggleHighContrast: () => void;
  colors: ReturnType<typeof getThemeColors>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyThemeToDocument(theme: Theme, highContrast: boolean) {
  if (typeof window === 'undefined') return;
  const root = window.document.documentElement;
  const effectiveTheme: ThemeName = highContrast || theme === 'high-contrast' ? 'high-contrast' : theme;

  root.classList.toggle('dark', effectiveTheme === 'dark' || effectiveTheme === 'high-contrast');
  root.classList.toggle('light', effectiveTheme === 'light');
  root.classList.toggle('high-contrast', effectiveTheme === 'high-contrast');
  root.setAttribute('data-theme', effectiveTheme);

  if (effectiveTheme === 'high-contrast') {
    root.setAttribute('data-high-contrast', 'true');
  } else {
    root.removeAttribute('data-high-contrast');
  }

  const styles = getThemeStyles(effectiveTheme);
  Object.entries(styles).forEach(([cssVar, value]) => {
    root.style.setProperty(cssVar, value);
  });
}

function readInitialHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const storedFlag = window.localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY);
    if (storedFlag === 'true') return true;
    if (storedFlag === 'false') return false;

    const prefs = getPreferences();
    if (prefs.accessibility?.highContrast) return true;

    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-contrast: more)').matches;
    }
  } catch {
    // Ignore storage/matchMedia errors in restricted environments
  }
  return false;
}

/**
 * ThemeProvider Component
 *
 * Provides theme context and dedicated WCAG AAA high-contrast mode management
 * to the application, syncing with user accessibility preferences in localStorage.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [baseTheme, setBaseTheme] = useState<'dark' | 'light'>('dark');
  const [isHighContrast, setIsHighContrastState] = useState<boolean>(false);

  useEffect(() => {
    const root = window.document.documentElement;
    let storedTheme: string | null = null;
    try {
      storedTheme = window.localStorage.getItem('theme');
    } catch {
      storedTheme = null;
    }

    const initialHighContrast =
      storedTheme === 'high-contrast' ||
      root.classList.contains('high-contrast') ||
      readInitialHighContrast();

    const initialBase: 'dark' | 'light' =
      storedTheme === 'light'
        ? 'light'
        : storedTheme === 'dark'
          ? 'dark'
          : root.classList.contains('light') && !root.classList.contains('dark')
            ? 'light'
            : 'dark';

    setBaseTheme(initialBase);
    setIsHighContrastState(initialHighContrast);
    applyThemeToDocument(initialHighContrast ? 'high-contrast' : initialBase, initialHighContrast);
  }, []);

  const persistHighContrast = useCallback((enabled: boolean) => {
    try {
      window.localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(enabled));
      const prefs = getPreferences();
      setPreferenceCategory('accessibility', {
        ...prefs.accessibility,
        highContrast: enabled,
      });
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setHighContrast = useCallback(
    (enabled: boolean) => {
      setIsHighContrastState(enabled);
      persistHighContrast(enabled);
      const nextTheme: Theme = enabled ? 'high-contrast' : baseTheme;
      try {
        window.localStorage.setItem('theme', nextTheme);
      } catch {
        // Ignore storage errors
      }
      applyThemeToDocument(nextTheme, enabled);
    },
    [baseTheme, persistHighContrast],
  );

  const toggleHighContrast = useCallback(() => {
    setHighContrast(!isHighContrast);
  }, [isHighContrast, setHighContrast]);

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      if (nextTheme === 'high-contrast') {
        setHighContrast(true);
        return;
      }
      setBaseTheme(nextTheme);
      setIsHighContrastState(false);
      persistHighContrast(false);
      try {
        window.localStorage.setItem('theme', nextTheme);
      } catch {
        // Ignore storage errors
      }
      applyThemeToDocument(nextTheme, false);
    },
    [persistHighContrast, setHighContrast],
  );

  const toggleTheme = useCallback(() => {
    if (isHighContrast) {
      setTheme(baseTheme === 'dark' ? 'light' : 'dark');
      return;
    }
    const nextTheme: 'dark' | 'light' = baseTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  }, [baseTheme, isHighContrast, setTheme]);

  const theme: Theme = isHighContrast ? 'high-contrast' : baseTheme;
  const colors = useMemo(() => getThemeColors(theme), [theme]);

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      isHighContrast,
      toggleTheme,
      setTheme,
      setHighContrast,
      toggleHighContrast,
      colors,
    }),
    [theme, isHighContrast, toggleTheme, setTheme, setHighContrast, toggleHighContrast, colors],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Access theme context. Throws if used outside ThemeProvider.
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Optional theme hook that returns undefined when rendered outside ThemeProvider.
 */
export function useOptionalTheme(): ThemeContextType | undefined {
  return useContext(ThemeContext);
}

export interface HighContrastToggleProps {
  className?: string;
  label?: string;
  description?: string;
}

/**
 * Accessible High-Contrast Mode toggle for user accessibility preferences.
 * Exceeds WCAG AAA (7:1) contrast requirements in high-contrast mode.
 */
export function HighContrastToggle({
  className = '',
  label = 'High-Contrast Mode (WCAG AAA)',
  description = 'Increases text, button, and code diff contrast above 7:1 with distinct borders and symbols.',
}: HighContrastToggleProps) {
  const { isHighContrast, toggleHighContrast } = useTheme();

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors ${
        isHighContrast
          ? 'border-[#ffffff] bg-[#000000] text-[#ffffff]'
          : 'border-white/10 bg-zinc-900/60 text-zinc-100'
      } ${className}`}
    >
      <div className="space-y-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span
          className={`block text-xs ${
            isHighContrast ? 'text-[#e0e0e0]' : 'text-zinc-300'
          }`}
        >
          {description}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isHighContrast}
        aria-label={label}
        onClick={toggleHighContrast}
        className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          isHighContrast
            ? 'border-[#ffffff] bg-[#ffd400] text-[#000000] focus:ring-[#ffd400] focus:ring-offset-[#000000]'
            : 'border-zinc-500 bg-zinc-800 text-white focus:ring-purple-500 focus:ring-offset-black'
        }`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full transition-transform ${
            isHighContrast
              ? 'translate-x-6 bg-[#000000]'
              : 'translate-x-0.5 bg-white'
          }`}
        />
      </button>
    </div>
  );
}
