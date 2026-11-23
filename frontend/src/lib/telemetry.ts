'use client';

import { useGlobalStore } from '@/stores/globalStore';

export interface TelemetryErrorEvent {
  id: string;
  timestamp: number;
  environment: string;
  appVersion: string;
  buildNumber: string;
  url: string;
  userAgent: string;
  errorName: string;
  errorMessage: string;
  errorStack?: string;
  componentStack?: string;
  sessionId: string;
  recoveryAction?: 'reset' | 'dismiss' | 'home' | 'copy';
  isRecovered: boolean;
}

let sessionId: string;

function getSessionId(): string {
  if (sessionId) return sessionId;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const existing = window.sessionStorage.getItem('soroban_playground_session_id');
    if (existing) {
      sessionId = existing;
      return sessionId;
    }
    sessionId = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
    window.sessionStorage.setItem('soroban_playground_session_id', sessionId);
    return sessionId;
  }
  sessionId = Math.random().toString(36).slice(2);
  return sessionId;
}

function getAppInfo() {
  if (typeof window === 'undefined') {
    return { environment: 'ssr', appVersion: '', buildNumber: '', url: '' };
  }
  const store = useGlobalStore.getState();
  return {
    environment: store.environment,
    appVersion: store.appVersion,
    buildNumber: store.buildNumber,
    url: window.location.href,
  };
}

/**
 * Logs an error telemetry event to the global store and console.
 * In production this can be wired up to a remote endpoint.
 */
export function logTelemetryError(params: {
  error: Error & { componentStack?: string };
  componentName?: string;
  isRecovered?: boolean;
}): TelemetryErrorEvent {
  const { error, componentName, isRecovered = false } = params;
  const { environment, appVersion, buildNumber, url } = getAppInfo();
  const event: TelemetryErrorEvent = {
    id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    environment,
    appVersion,
    buildNumber,
    url,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'ssr',
    errorName: error.name || 'Error',
    errorMessage: error.message,
    errorStack: error.stack,
    componentStack: error.componentStack,
    sessionId: getSessionId(),
    recoveryAction: undefined,
    isRecovered,
  };

  // Persist to global store for dashboard visibility
  try {
    const currentErrors = JSON.parse(
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('soroban_telemetry_errors') || '[]'
        : '[]'
    );
    currentErrors.push(event);
    if (currentErrors.length > 50) currentErrors.shift();
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('soroban_telemetry_errors', JSON.stringify(currentErrors));
    }
  } catch {
    // sessionStorage may be disabled; ignore
  }

  console.error('[Telemetry] Error captured:', {
    id: event.id,
    component: componentName,
    error: event.errorName,
    message: event.errorMessage,
    sessionId: event.sessionId,
    recovered: event.isRecovered,
  });

  return event;
}

/**
 * Records a recovery action taken by the user on a telemetry error.
 */
export function recordRecoveryAction(eventId: string, action: TelemetryErrorEvent['recoveryAction']) {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('soroban_telemetry_errors') : null;
    if (!raw) return;
    const errors: TelemetryErrorEvent[] = JSON.parse(raw);
    const idx = errors.findIndex((e) => e.id === eventId);
    if (idx !== -1) {
      errors[idx].recoveryAction = action;
      errors[idx].isRecovered = true;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('soroban_telemetry_errors', JSON.stringify(errors));
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Retrieves all captured telemetry errors for the current session.
 */
export function getTelemetryErrors(): TelemetryErrorEvent[] {
  try {
    const raw =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('soroban_telemetry_errors')
        : null;
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
