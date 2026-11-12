export type FeedbackSeverity = 'success' | 'warning' | 'error';

export const HAPTIC_PATTERNS: Record<FeedbackSeverity, number[]> = {
  success: [25],
  warning: [40, 60, 40],
  error: [80, 50, 80, 50, 80],
};

export function triggerHapticPulse(
  severity: FeedbackSeverity,
  enabled: boolean = true,
  nav: { vibrate?: (pattern: number | number[]) => boolean } | undefined = typeof navigator !==
  'undefined'
    ? navigator
    : undefined
): boolean {
  if (!enabled || !nav || typeof nav.vibrate !== 'function') {
    return false;
  }
  const pattern = HAPTIC_PATTERNS[severity] ?? HAPTIC_PATTERNS.success;
  try {
    return nav.vibrate(pattern);
  } catch {
    return false;
  }
}
