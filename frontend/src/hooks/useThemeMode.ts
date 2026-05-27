'use client';

import { THEME_COLORS, getChartColors } from '@/lib/theme/themeColors';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function useThemeMode() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme === 'system' ? systemTheme : theme) : 'dark';
  const isDark = currentTheme === 'dark';
  const isLight = currentTheme === 'light';

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const setThemeMode = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
  };

  // Get current theme colors
  const colors = currentTheme === 'light' ? THEME_COLORS.light : THEME_COLORS.dark;

  // Get chart colors for D3
  const chartColors = getChartColors(currentTheme as 'light' | 'dark');

  return {
    theme: currentTheme as 'light' | 'dark',
    isDark,
    isLight,
    mounted,
    toggleTheme,
    setThemeMode,
    colors,
    chartColors,
  };
}

// Hook to get CSS variable value
export function useThemeVariable(variableName: string): string {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const style = getComputedStyle(document.documentElement);
      setValue(style.getPropertyValue(variableName).trim());
    }
  }, [variableName]);

  return value;
}
