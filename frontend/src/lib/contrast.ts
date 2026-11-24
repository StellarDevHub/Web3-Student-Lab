'use client';

// WCAG contrast ratio utilities for the Dynamic Theme Engine (FE-HARD-41).
// Provides relative luminance calculation, contrast ratio computation, and
// WCAG AAA (7:1) compliance checks for text and code syntax highlighting.

/**
 * Converts an 8-bit sRGB channel to linear RGB.
 */
function sRGBToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Parses a hex color string (#RRGGBB or #RGB) into [r, g, b] 0-255.
 * Returns null for invalid input.
 */
export function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return [r, g, b];
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

/**
 * Converts an RGB color to HSL [h, s, l] where h is 0-360, s and l are 0-1.
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr:
        h = (gg - bb) / d + (gg < bb ? 6 : 0);
        break;
      case gg:
        h = (bb - rr) / d + 2;
        break;
      case bb:
        h = (rr - gg) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return [h, s, l];
}

/**
 * Converts HSL [h, s, l] to RGB [r, g, b] 0-255.
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let bb = 0;

  if (s === 0) {
    r = g = bb = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h / 360 + 1 / 3);
    g = hue2rgb(p, q, h / 360);
    bb = hue2rgb(p, q, h / 360 - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(bb * 255)];
}

/**
 * Returns the relative luminance of an sRGB color (WCAG definition).
 */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(sRGBToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Returns the WCAG contrast ratio between two colors (1 to 21).
 * Returns null if either color cannot be parsed.
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const lum1 = relativeLuminance(foreground);
  const lum2 = relativeLuminance(background);
  if (lum1 === null || lum2 === null) return null;
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG levels: AA normal text = 4.5:1, AA large text = 3:1, AAA normal = 7:1, AAA large = 4.5:1.
 */
export const WCAG = {
  AA_NORMAL: 4.5,
  AA_LARGE: 3.0,
  AAA_NORMAL: 7.0,
  AAA_LARGE: 4.5,
} as const;

/**
 * Checks whether a foreground/background pair meets a given WCAG contrast ratio.
 */
export function meetsContrast(
  foreground: string,
  background: string,
  level: keyof typeof WCAG
): { ratio: number | null; passes: boolean } {
  const ratio = contrastRatio(foreground, background);
  return { ratio, passes: ratio !== null && ratio >= WCAG[level] };
}

/**
 * Given a background color, returns a foreground color (black or white) that
 * satisfies the requested WCAG level.
 */
export function accessibleForeground(
  background: string,
  level: keyof typeof WCAG = 'AAA_NORMAL'
): string {
  const ratioBlack = contrastRatio('#000000', background);
  const ratioWhite = contrastRatio('#ffffff', background);
  const target = WCAG[level];

  if (ratioBlack !== null && ratioWhite !== null) {
    // Pick the color with the higher ratio; prefer the one that passes.
    const blackPasses = ratioBlack >= target;
    const whitePasses = ratioWhite >= target;
    if (blackPasses && whitePasses) {
      return ratioBlack >= ratioWhite ? '#000000' : '#ffffff';
    }
    if (blackPasses) return '#000000';
    if (whitePasses) return '#ffffff';
    // Neither passes: choose the higher-contrast option anyway.
    return ratioBlack >= ratioWhite ? '#000000' : '#ffffff';
  }
  return '#000000';
}

/**
 * Validates a set of code-syntax highlight token colors against a background
 * for WCAG AAA compliance. Returns a report of which tokens pass/fail.
 */
export function validateSyntaxTokens(
  tokens: Record<string, string>,
  background: string
): Record<string, { ratio: number | null; passesAAA: boolean; fixed?: string }> {
  const report: Record<string, { ratio: number | null; passesAAA: boolean; fixed?: string }> =
    {};
  for (const [token, color] of Object.entries(tokens)) {
    const { ratio, passes } = meetsContrast(color, background, 'AAA_NORMAL');
    const entry: { ratio: number | null; passesAAA: boolean; fixed?: string } = {
      ratio,
      passesAAA: passes,
    };
    if (!passes && ratio !== null) {
      entry.fixed = accessibleForeground(background, 'AAA_NORMAL');
    }
    report[token] = entry;
  }
  return report;
}
