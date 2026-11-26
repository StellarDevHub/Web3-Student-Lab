import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HighContrastToggle, ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import {
  HIGH_CONTRAST_DIFF_COLORS,
  THEME_COLORS,
  getContrastRatio,
  getThemeColors,
  getThemeStyles,
  meetsWcagAAA,
} from '@/lib/theme/themeColors';
import { DiffViewer } from '@/components/diff/DiffViewer';

vi.mock('next/dynamic', () => ({
  default: () => {
    const MockDiffEditor = () => <div data-testid="mock-monaco-diff-editor" />;
    return MockDiffEditor;
  },
}));

vi.mock('@/lib/editor/monaco-loader', () => ({}));

function ThemeConsumer() {
  const { theme, isHighContrast, toggleHighContrast, setHighContrast, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <span data-testid="hc-value">{String(isHighContrast)}</span>
      <button type="button" onClick={toggleHighContrast}>
        Toggle HC
      </button>
      <button type="button" onClick={() => setHighContrast(true)}>
        Enable HC
      </button>
      <button type="button" onClick={toggleTheme}>
        Toggle Theme
      </button>
    </div>
  );
}

describe('FE-094: High-Contrast Mode (WCAG AAA)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-high-contrast');
  });

  describe('WCAG AAA (>= 7:1) contrast ratios in THEME_COLORS.highContrast', () => {
    const hc = THEME_COLORS.highContrast;
    const backdrops = Object.values(hc.background);

    it('ensures all typography colors (including muted) exceed 7:1 against all backdrops', () => {
      for (const bg of backdrops) {
        for (const [token, fg] of Object.entries(hc.text)) {
          const ratio = getContrastRatio(fg, bg);
          expect(ratio, `text.${token} (${fg}) on ${bg} should be >= 7:1`).toBeGreaterThanOrEqual(7);
          expect(meetsWcagAAA(fg, bg)).toBe(true);
        }
      }
    });

    it('ensures all status colors exceed 7:1 against all backdrops', () => {
      for (const bg of backdrops) {
        for (const [token, fg] of Object.entries(hc.status)) {
          const ratio = getContrastRatio(fg, bg);
          expect(ratio, `status.${token} (${fg}) on ${bg} should be >= 7:1`).toBeGreaterThanOrEqual(7);
        }
      }
    });

    it('ensures actionable button colors exceed 7:1 against their foreground/backdrop', () => {
      expect(getContrastRatio('#000000', hc.interactive.primary)).toBeGreaterThanOrEqual(7);
      expect(getContrastRatio('#000000', hc.interactive.primaryHover)).toBeGreaterThanOrEqual(7);
      expect(getContrastRatio(hc.interactive.primary, hc.background.primary)).toBeGreaterThanOrEqual(7);
      expect(getContrastRatio(hc.text.primary, hc.interactive.secondary)).toBeGreaterThanOrEqual(7);
      expect(getContrastRatio(hc.text.primary, hc.interactive.secondaryHover)).toBeGreaterThanOrEqual(7);
    });

    it('ensures diff added/removed text colors exceed 7:1 against their diff backgrounds', () => {
      expect(
        getContrastRatio(HIGH_CONTRAST_DIFF_COLORS.addedText, HIGH_CONTRAST_DIFF_COLORS.addedBackground),
      ).toBeGreaterThanOrEqual(7);
      expect(
        getContrastRatio(HIGH_CONTRAST_DIFF_COLORS.removedText, HIGH_CONTRAST_DIFF_COLORS.removedBackground),
      ).toBeGreaterThanOrEqual(7);
      expect(
        getContrastRatio(HIGH_CONTRAST_DIFF_COLORS.addedBorder, HIGH_CONTRAST_DIFF_COLORS.addedBackground),
      ).toBeGreaterThanOrEqual(7);
      expect(
        getContrastRatio(HIGH_CONTRAST_DIFF_COLORS.removedBorder, HIGH_CONTRAST_DIFF_COLORS.removedBackground),
      ).toBeGreaterThanOrEqual(7);
    });

    it('resolves high-contrast palette and CSS variables via helper functions', () => {
      expect(getThemeColors('high-contrast')).toEqual(hc);
      const styles = getThemeStyles('high-contrast');
      expect(styles['--color-bg-primary']).toBe('#000000');
      expect(styles['--color-text-muted']).toBe('#b8b8b8');
      expect(styles['--color-interactive-primary']).toBe('#ffd400');
    });
  });

  describe('ThemeContext & HighContrastToggle', () => {
    it('toggles high-contrast mode, updates document attributes, and persists preference', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
          <HighContrastToggle />
        </ThemeProvider>,
      );

      expect(screen.getByTestId('hc-value')).toHaveTextContent('false');
      const switchBtn = screen.getByRole('switch', { name: /High-Contrast Mode/i });
      expect(switchBtn).toHaveAttribute('aria-checked', 'false');

      fireEvent.click(switchBtn);

      expect(screen.getByTestId('hc-value')).toHaveTextContent('true');
      expect(screen.getByTestId('theme-value')).toHaveTextContent('high-contrast');
      expect(switchBtn).toHaveAttribute('aria-checked', 'true');
      expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
      expect(document.documentElement.getAttribute('data-high-contrast')).toBe('true');
      expect(window.localStorage.getItem('web3-lab-high-contrast')).toBe('true');

      // Toggle back off
      fireEvent.click(switchBtn);
      expect(screen.getByTestId('hc-value')).toHaveTextContent('false');
      expect(document.documentElement.classList.contains('high-contrast')).toBe(false);
      expect(document.documentElement.getAttribute('data-high-contrast')).toBeNull();
    });
  });

  describe('DiffViewer high-contrast accessibility', () => {
    it('renders accessible addition/deletion symbols, legend, and high-contrast attributes', async () => {
      render(
        <ThemeProvider>
          <DiffViewer
            original={'fn main() {\n  let x = 1;\n}'}
            modified={'fn main() {\n  let x = 2;\n  let y = 3;\n}'}
            filename="contract.rs"
            highContrast={true}
          />
        </ThemeProvider>,
      );

      const region = screen.getByRole('region', { name: /Diff viewer — contract\.rs/i });
      expect(region).toHaveAttribute('data-high-contrast', 'true');

      const legend = screen.getByRole('note', { name: /Diff change legend/i });
      expect(legend).toHaveTextContent('+');
      expect(legend).toHaveTextContent('Added');
      expect(legend).toHaveTextContent('−');
      expect(legend).toHaveTextContent('Removed');

      await waitFor(() => {
        expect(screen.getByLabelText(/1 removed, 2 added/i)).toBeInTheDocument();
      });
    });
  });
});
