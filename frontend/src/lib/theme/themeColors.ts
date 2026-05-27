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
};

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

// Helper to apply theme colors
export function getThemeColors(theme: 'light' | 'dark') {
  return THEME_COLORS[theme];
}

// Helper to get chart colors for the current theme
export function getChartColors(theme: 'light' | 'dark') {
  return THEME_COLORS[theme].chart;
}

// Generate inline styles for theme
export function getThemeStyles(theme: 'light' | 'dark') {
  const colors = THEME_COLORS[theme];
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
