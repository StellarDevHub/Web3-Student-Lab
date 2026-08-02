'use client';

import { THEME_COLORS, getChartColors } from '@/lib/theme/themeColors';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useThemePreferences } from './useUserPreferences';

/**
 * useThemeMode Hook
 *
 * This hook provides comprehensive theme management for the application.
 * It integrates with next-themes to provide:
 *
 * - Automatic system preference detection (light/dark)
 * - Manual theme override capability
 * - Persistent theme storage
 * - Theme color utilities for styling
 * - Proper hydration handling to prevent FOUC
 *
 * Why use this hook?
 * - Centralized theme state management
 * - Respects user accessibility preferences
 * - Provides color utilities for consistent styling
 * - Handles SSR/hydration properly
 *
 * @returns {Object} Theme state and control functions
 * @returns {('light'|'dark')} theme - Current active theme
 * @returns {boolean} isDark - Whether current theme is dark
 * @returns {boolean} isLight - Whether current theme is light
 * @returns {boolean} mounted - Whether component is hydrated (use to prevent FOUC)
 * @returns {Function} toggleTheme - Toggle between light and dark
 * @returns {Function} setThemeMode - Set specific theme ('light', 'dark', or 'system')
 * @returns {Object} colors - Current theme color palette
 * @returns {Object} chartColors - Colors optimized for D3 charts
 *
 * @example
 * // In a client component
 * 'use client'
 *
 * import { useThemeMode } from '@/hooks/useThemeMode'
 *
 * export function MyComponent() {
 *   const { isDark, toggleTheme, colors } = useThemeMode()
 *
 *   return (
 *     <button onClick={toggleTheme}>
 *       Current theme: {isDark ? 'Dark' : 'Light'}
 *     </button>
 *   )
 * }
 */
export function useThemeMode() {
  // Get theme from next-themes provider
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { theme: storedTheme, setTheme: setStoredTheme } = useThemePreferences();

  // Effect to set mounted state after hydration
  // This prevents FOUC by ensuring the component only renders after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Resolve the actual theme considering system preference
  // If theme is 'system', use the detected systemTheme
  // If not mounted yet (hydration in progress), default to 'dark'
  const currentTheme = mounted ? (theme === 'system' ? systemTheme : theme) : 'dark';
  const isDark = currentTheme === 'dark';
  const isLight = currentTheme === 'light';

  /**
   * Toggle between light and dark themes
   *
   * This function:
   * 1. Determines the opposite theme
   * 2. Updates the theme state
   * 3. Automatically persists to localStorage via next-themes
   * 4. Updates the HTML class for CSS styling
   * 5. Triggers smooth transition via CSS
   */
  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
    setStoredTheme(newTheme);
  };

  /**
   * Set theme to a specific value
   *
   * @param {('light'|'dark'|'system')} newTheme - The theme to set
   *
   * Usage:
   * - 'light': Force light mode
   * - 'dark': Force dark mode
   * - 'system': Use OS preference
   */
  const setThemeMode = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    setStoredTheme(newTheme);
  };

  // Get current theme colors
  const colors = currentTheme === 'light' ? THEME_COLORS.light : THEME_COLORS.dark;

  // Get chart colors optimized for D3 visualizations
  // These colors are chosen for good contrast and visual distinction
  const chartColors = getChartColors(currentTheme as 'light' | 'dark');

  return {
    theme: currentTheme as 'light' | 'dark',
    isDark,
    isLight,
    mounted, // Use this to conditionally render to prevent FOUC
    toggleTheme,
    setThemeMode,
    colors,
    chartColors,
  };
}

/**
 * useThemeVariable Hook
 *
 * This hook retrieves a specific CSS variable value from the document root.
 * Useful for accessing theme colors in JavaScript when needed.
 *
 * Why use this?
 * - Dynamic color values in components
 * - Canvas/SVG rendering that needs theme colors
 * - Animation calculations based on theme
 *
 * @param {string} variableName - The CSS variable name (e.g., '--bg-primary')
 * @returns {string} The computed CSS variable value
 *
 * @example
 * const bgColor = useThemeVariable('--bg-primary')
 * // Returns: '#ffffff' (light mode) or '#000000' (dark mode)
 */
export function useThemeVariable(variableName: string): string {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (typeof document !== 'undefined') {
      // Get computed style from root element
      const style = getComputedStyle(document.documentElement);
      // Extract the variable value and trim whitespace
      setValue(style.getPropertyValue(variableName).trim());
    }
  }, [variableName]);

  return value;
}
