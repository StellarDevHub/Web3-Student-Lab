'use client';

import { AnimatedContainer } from '@/components/animations';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useThemeMode } from '@/hooks/useThemeMode';
import React from 'react';

interface ThemedComponentProps {
  children?: React.ReactNode;
}

// Example component showing how to use theme colors
export const ThemedCard: React.FC<ThemedComponentProps & { title?: string }> = ({
  children,
  title,
}) => {
  const { colors, isDark } = useThemeMode();

  return (
    <div
      style={{
        backgroundColor: colors.background.secondary,
        borderColor: colors.border.light,
        color: colors.text.primary,
      }}
      className="rounded-lg border p-4 transition-colors duration-300"
    >
      {title && (
        <h3 style={{ color: colors.text.primary }} className="mb-2 font-semibold">
          {title}
        </h3>
      )}
      <p style={{ color: colors.text.secondary }}>{children}</p>
    </div>
  );
};

// Example D3 chart wrapper with theme support
export const ThemedChart: React.FC<{
  children: (colors: any) => React.ReactNode;
}> = ({ children }) => {
  const { chartColors } = useThemeMode();

  return <div>{children(chartColors)}</div>;
};

// Theme selector with quick options
export const ThemeSwitcher: React.FC = () => {
  const { theme, mounted, setThemeMode } = useThemeMode();

  if (!mounted) {
    return null;
  }

  return (
    <AnimatedContainer variant="slideInDown">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Theme:</span>
        <select
          value={theme}
          onChange={(e) => setThemeMode(e.target.value as 'light' | 'dark' | 'system')}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1 text-sm text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </div>
    </AnimatedContainer>
  );
};

// Example showing theme colors in action
export const ThemeShowcase: React.FC = () => {
  const { colors, isDark, toggleTheme, mounted } = useThemeMode();

  if (!mounted) {
    return null;
  }

  return (
    <AnimatedContainer variant="slideInUp" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Theme Showcase</h2>
        <ThemeToggle size="md" variant="button" showLabel />
      </div>

      {/* Color Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Background Colors */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">Backgrounds</h3>
          {Object.entries(colors.background).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <div
                style={{ backgroundColor: value }}
                className="h-6 w-6 rounded border border-gray-700"
              />
              <span className="text-sm capitalize">{key}</span>
            </div>
          ))}
        </div>

        {/* Text Colors */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">Text</h3>
          {Object.entries(colors.text).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <div
                style={{ backgroundColor: value }}
                className="h-6 w-6 rounded border border-gray-700"
              />
              <span className="text-sm capitalize">{key}</span>
            </div>
          ))}
        </div>

        {/* Status Colors */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">Status</h3>
          {Object.entries(colors.status).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <div
                style={{ backgroundColor: value }}
                className="h-6 w-6 rounded border border-gray-700"
              />
              <span className="text-sm capitalize">{key}</span>
            </div>
          ))}
        </div>

        {/* Interactive Colors */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">Interactive</h3>
          {Object.entries(colors.interactive).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <div
                style={{ backgroundColor: value }}
                className="h-6 w-6 rounded border border-gray-700"
              />
              <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Current Theme Info */}
      <div
        style={{
          backgroundColor: colors.background.tertiary,
          borderColor: colors.border.medium,
          color: colors.text.secondary,
        }}
        className="rounded-lg border p-4"
      >
        <p className="text-sm">
          Current theme: <strong>{isDark ? 'Dark' : 'Light'}</strong>
        </p>
        <p className="text-sm">Colors update smoothly as you toggle the theme.</p>
      </div>
    </AnimatedContainer>
  );
};
