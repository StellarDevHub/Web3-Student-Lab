/**
 * Normalize Express req.query / req.params values to a single string.
 * Handles string | string[] | undefined (and ParsedQs-like objects).
 */
export function getQueryString(
  value: unknown,
  defaultValue = ''
): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : defaultValue;
  }
  return defaultValue;
}

/**
 * Parse a query value as an integer with a fallback.
 */
export function getQueryInt(value: unknown, defaultValue: number): number {
  const raw = getQueryString(value);
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse a query value as a boolean (`'true'` => true).
 */
export function getQueryBoolean(value: unknown, defaultValue = false): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  return getQueryString(value) === 'true';
}
