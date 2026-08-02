import logger from '../utils/logger.js';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SimulatorError {
  id: string;
  sessionId: string;
  userId?: string;
  severity: ErrorSeverity;
  code: string;
  message: string;
  context: Record<string, unknown>;
  timestamp: Date;
}

// In-memory store for the simulator session (not persisted to DB —
// simulator errors are ephemeral by design).
const errorStore: SimulatorError[] = [];

const MAX_ERRORS = 500;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Record a new simulator error.
 */
export function logSimulatorError(
  sessionId: string,
  severity: ErrorSeverity,
  code: string,
  message: string,
  context: Record<string, unknown> = {},
  userId?: string
): SimulatorError {
  const entry: SimulatorError = {
    id: generateId(),
    sessionId,
    userId,
    severity,
    code,
    message,
    context,
    timestamp: new Date(),
  };

  errorStore.push(entry);

  // Evict oldest when the cap is reached
  if (errorStore.length > MAX_ERRORS) {
    errorStore.splice(0, errorStore.length - MAX_ERRORS);
  }

  logger.warn('Simulator error logged', { id: entry.id, sessionId, severity, code });
  return entry;
}

/**
 * Retrieve errors for a session, optionally filtered by severity.
 */
export function getSessionErrors(
  sessionId: string,
  severity?: ErrorSeverity
): SimulatorError[] {
  return errorStore.filter(
    (e) => e.sessionId === sessionId && (severity == null || e.severity === severity)
  );
}

/**
 * Retrieve all errors for a user across sessions.
 */
export function getUserErrors(userId: string): SimulatorError[] {
  return errorStore.filter((e) => e.userId === userId);
}

/**
 * Clear all errors for a given session.
 */
export function clearSessionErrors(sessionId: string): number {
  const before = errorStore.length;
  const indices = errorStore
    .map((e, i) => (e.sessionId === sessionId ? i : -1))
    .filter((i) => i >= 0)
    .reverse();
  indices.forEach((i) => errorStore.splice(i, 1));
  return before - errorStore.length;
}
