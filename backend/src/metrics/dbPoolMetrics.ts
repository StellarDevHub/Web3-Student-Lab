/**
 * Last-known database connection pool utilisation, written by the DB health
 * check and read by the Prometheus exporter. Kept in its own module so the
 * exporter does not import the health check (avoids a circular dependency).
 */

let poolUtilizationPct: number | null = null;

/** Record the latest pool utilisation (0-100). Non-finite values are ignored. */
export function setDbPoolUtilizationPct(value: number): void {
  if (!Number.isFinite(value)) return;
  poolUtilizationPct = Math.min(100, Math.max(0, value));
}

/** Latest recorded pool utilisation, or null if no health check has run yet. */
export function getDbPoolUtilizationPct(): number | null {
  return poolUtilizationPct;
}

/** Test helper: forget the recorded value. */
export function resetDbPoolUtilizationPct(): void {
  poolUtilizationPct = null;
}
