// Theme configuration and CSS variables
export const THEME_COLORS = {
  light: {
    // Background colors
    background: {
      primary: '#ffffff',
      secondary: '#f8f8f8',
      tertiary: '#f0f0f0',
      accent: '#fafafa',
    },
    // Text colors
    text: {
      primary: '#1a1a1a',
      secondary: '#666666',
      tertiary: '#999999',
      muted: '#cccccc',
    },
    // Border colors
    border: {
      light: '#e5e5e5',
      medium: '#d0d0d0',
      dark: '#b0b0b0',
    },
    // Interactive colors
    interactive: {
      primary: '#7C3AED',
      primaryHover: '#6d28d9',
      secondary: '#f0f0f0',
      secondaryHover: '#e0e0e0',
    },
    // Status colors
    status: {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
    },
    // Chart colors
    chart: {
      primary: '#7C3AED',
      accent: '#A78BFA',
      neutral: '#d1d5db',
      text: '#1a1a1a',
    },
  },
  dark: {
    // Background colors
    background: {
      primary: '#000000',
      secondary: '#0a0a0a',
      tertiary: '#121212',
      accent: '#1a1a1a',
    },
    // Text colors
    text: {
      primary: '#ffffff',
      secondary: '#e5e5e5',
      tertiary: '#a0a0a0',
      muted: '#666666',
    },
    // Border colors
    border: {
      light: '#2d2d2d',
      medium: '#3d3d3d',
      dark: '#4d4d4d',
    },
    // Interactive colors
    interactive: {
      primary: '#7C3AED',
      primaryHover: '#a78bfa',
      secondary: '#2d2d2d',
      secondaryHover: '#3d3d3d',
    },
    // Status colors
    status: {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
    },
    // Chart colors
    chart: {
      primary: '#7C3AED',
      accent: '#A78BFA',
      neutral: '#4b5563',
      text: '#ffffff',
    },
  },
  oled: {
    // Background colors
    background: {
      primary: '#000000',
      secondary: '#000000',
      tertiary: '#000000',
      accent: '#000000',
    },
    // Text colors
    text: {
      primary: '#ffffff',
      secondary: '#ffffff',
      tertiary: '#ffffff',
      muted: '#cccccc',
    },
    // Border colors
    border: {
      light: '#555555',
      medium: '#666666',
      dark: '#777777',
    },
    // Interactive colors
    interactive: {
      primary: '#ffaa00',
      primaryHover: '#ffcc00',
      secondary: '#333333',
      secondaryHover: '#444444',
    },
    // Status colors
    status: {
      success: '#00ff00',
      error: '#ff0000',
      warning: '#ffcc00',
      info: '#00ffff',
    },
    // Chart colors
    chart: {
      primary: '#ff00ff',
      accent: '#00ffff',
      neutral: '#888888',
      text: '#ffffff',
    },
  },
  highContrast: {
    // Background colors - Pure black & near-black surfaces for maximum contrast
    background: {
      primary: '#000000',
      secondary: '#0a0a0a',
      tertiary: '#121212',
      accent: '#141414',
    },
    // Text colors - All exceed WCAG AAA 7:1 contrast against all high-contrast backdrops
    text: {
      primary: '#ffffff',
      secondary: '#f5f5f5',
      tertiary: '#e0e0e0',
      muted: '#b8b8b8',
    },
    // Border colors - High visibility borders (>= 7:1 against #000000)
    border: {
      light: '#a3a3a3',
      medium: '#d4d4d4',
      dark: '#ffffff',
    },
    // Interactive colors - >= 7:1 contrast with foreground/backdrop
    interactive: {
      primary: '#ffd400',
      primaryHover: '#ffea70',
      secondary: '#1f1f1f',
      secondaryHover: '#333333',
    },
    // Status colors - All exceed 7:1 contrast against dark backdrops
    status: {
      success: '#5cff8a',
      error: '#ff9494',
      warning: '#ffd400',
      info: '#70d6ff',
    },
    // Chart colors - Distinct high-contrast palette
    chart: {
      primary: '#ffd400',
      accent: '#70d6ff',
      neutral: '#b8b8b8',
      text: '#ffffff',
    },
  },
};

export type ThemeName = 'light' | 'dark' | 'oled' | 'high-contrast';

export const HIGH_CONTRAST_DIFF_COLORS = {
  addedBackground: '#003314',
  addedLineBackground: '#00260f',
  addedBorder: '#5cff8a',
  addedText: '#ffffff',
  addedSymbol: '+',
  removedBackground: '#3d0000',
  removedLineBackground: '#2b0000',
  removedBorder: '#ff9494',
  removedText: '#ffffff',
  removedSymbol: '−',
} as const;

function parseHexColor(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').trim();
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function getRelativeLuminance(hex: string): number {
  const [r, g, b] = parseHexColor(hex).map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate WCAG 2.1 contrast ratio between two hex colors.
 * Returns a value between 1 and 21.
 */
export function getContrastRatio(foreground: string, background: string): number {
  const l1 = getRelativeLuminance(foreground);
  const l2 = getRelativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Returns true if the foreground/background pair meets WCAG AAA (>= 7:1).
 */
export function meetsWcagAAA(foreground: string, background: string): boolean {
  return getContrastRatio(foreground, background) >= 7;
}

// CSS variable names
export const CSS_VARIABLES = {
  background: {
    primary: '--color-bg-primary',
    secondary: '--color-bg-secondary',
    tertiary: '--color-bg-tertiary',
    accent: '--color-bg-accent',
  },
  text: {
    primary: '--color-text-primary',
    secondary: '--color-text-secondary',
    tertiary: '--color-text-tertiary',
    muted: '--color-text-muted',
  },
  border: {
    light: '--color-border-light',
    medium: '--color-border-medium',
    dark: '--color-border-dark',
  },
  interactive: {
    primary: '--color-interactive-primary',
    primaryHover: '--color-interactive-primary-hover',
    secondary: '--color-interactive-secondary',
    secondaryHover: '--color-interactive-secondary-hover',
  },
  status: {
    success: '--color-status-success',
    error: '--color-status-error',
    warning: '--color-status-warning',
    info: '--color-status-info',
  },
  chart: {
    primary: '--color-chart-primary',
    accent: '--color-chart-accent',
    neutral: '--color-chart-neutral',
    text: '--color-chart-text',
  },
};

function resolvePaletteKey(theme: ThemeName): keyof typeof THEME_COLORS {
  return theme === 'high-contrast' ? 'highContrast' : theme;
}

// Helper to apply theme colors
export function getThemeColors(theme: ThemeName) {
  return THEME_COLORS[resolvePaletteKey(theme)];
}

// Helper to get chart colors for the current theme
export function getChartColors(theme: ThemeName) {
  return THEME_COLORS[resolvePaletteKey(theme)].chart;
}

// Generate inline styles for theme
export function getThemeStyles(theme: ThemeName) {
  const colors = THEME_COLORS[resolvePaletteKey(theme)];
  const vars: Record<string, string> = {};

  // Build CSS variable assignments
  Object.entries(colors).forEach(([category, colorMap]) => {
    if (typeof colorMap === 'object') {
      Object.entries(colorMap).forEach(([key, value]) => {
        const cssVar = CSS_VARIABLES[category as keyof typeof CSS_VARIABLES]?.[key as any];
        if (cssVar) {
          vars[cssVar] = value;
        }
      });
    }
  });

  return vars;
}
