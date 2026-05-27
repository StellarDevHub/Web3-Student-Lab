// D3 Chart theming utilities
import { THEME_COLORS } from '@/lib/theme/themeColors';

export type ChartTheme = 'light' | 'dark';

// Get color scale for charts based on theme
export function getChartColorScale(theme: ChartTheme) {
  const colors = THEME_COLORS[theme];
  return [
    colors.chart.primary,
    colors.chart.accent,
    '#8b5cf6', // violet-500
    '#6366f1', // indigo-500
    '#0ea5e9', // cyan-500
    '#14b8a6', // teal-500
    '#f59e0b', // amber-500
    '#ef4444', // red-500
  ];
}

// Get D3-ready color scale
export function createD3ColorScale(theme: ChartTheme) {
  const colors = getChartColorScale(theme);
  return function getColor(index: number) {
    return colors[index % colors.length];
  };
}

// Get chart styling based on theme
export function getChartStyles(theme: ChartTheme) {
  const colors = THEME_COLORS[theme];
  return {
    textColor: colors.chart.text,
    gridColor: theme === 'dark' ? '#2d2d2d' : '#e5e5e5',
    axisColor: colors.chart.neutral,
    backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
    colors: getChartColorScale(theme),
  };
}

// SVG text styling for charts
export function getChartTextStyle(theme: ChartTheme) {
  const colors = THEME_COLORS[theme];
  return {
    fill: colors.chart.text,
    fontSize: '12px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };
}

// Axis styling for D3
export function getChartAxisStyle(theme: ChartTheme) {
  const colors = THEME_COLORS[theme];
  return {
    color: colors.chart.neutral,
    stroke: colors.chart.neutral,
    textFill: colors.chart.text,
  };
}

// Line chart styling
export function getLineChartStyle(theme: ChartTheme) {
  const styles = getChartStyles(theme);
  return {
    ...styles,
    lineWidth: 2,
    pointRadius: 4,
    pointStroke: 2,
    areaOpacity: 0.1,
  };
}

// Bar chart styling
export function getBarChartStyle(theme: ChartTheme) {
  const styles = getChartStyles(theme);
  return {
    ...styles,
    barOpacity: 0.8,
    barHoverOpacity: 1,
  };
}

// Tooltip styling for charts
export function getTooltipStyle(theme: ChartTheme) {
  const colors = THEME_COLORS[theme];
  return {
    backgroundColor: theme === 'dark' ? '#2d2d2d' : '#f8f8f8',
    textColor: colors.chart.text,
    borderColor: colors.chart.neutral,
    padding: '8px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    boxShadow: theme === 'dark' ? '0 4px 6px rgba(0, 0, 0, 0.5)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
  };
}

// Legend styling for charts
export function getLegendStyle(theme: ChartTheme) {
  const colors = THEME_COLORS[theme];
  return {
    textColor: colors.chart.text,
    backgroundColor: theme === 'dark' ? '#0a0a0a' : '#ffffff',
    borderColor: colors.chart.neutral,
  };
}
