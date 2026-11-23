'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/lib/api-config';

/**
 * Session Activity Monitor hook (#1116).
 *
 * Protects shared lab terminals:
 *
 *  - Monitors mouse / keyboard / touch activity and reports it to the
 *    backend (`POST /api/v1/auth/session/activity`) so idle time is tracked
 *    server-side and survives reloads.
 *  - After `idleLockMs` (default 15m) of inactivity the UI is blurred and a
 *    re-authentication challenge is required to resume — without logging out.
 *  - After `extendedIdleMs` (default 30m) the backend purges the session
 *    (revokes tokens, terminates WebSocket channels); the hook then performs
 *    a full logout so memory credentials are cleared.
 *
 * Usage:
 * ```tsx
 * const { locked, blur, reauthenticate, remainingIdleMs } =
 *   useSessionActivityMonitor({ onPurged: logout });
 * ```
 */

const DEFAULT_IDLE_LOCK_MS = 15 * 60 * 1000;
const DEFAULT_EXTENDED_IDLE_MS = 30 * 60 * 1000;
/** How often the client re-checks idle state while no events fire. */
const CHECK_INTERVAL_MS = 30_000;
/** Throttle activity POSTs so a burst of events is one request. */
const ACTIVITY_POST_THROTTLE_MS = 60_000;

export interface UseSessionActivityMonitorOptions {
  idleLockMs?: number;
  extendedIdleMs?: number;
  /** Called when the session is purged by extended idle (full logout). */
  onPurged?: () => void;
  /** Called when the session is locked (blur UI, show re-auth). */
  onLocked?: () => void;
  /** Called when the session is unlocked after re-auth. */
  onUnlocked?: () => void;
  /** API base URL (defaults to shared API_BASE_URL). */
  url?: string;
}

export interface UseSessionActivityMonitorReturn {
  /** True while the session is locked (UI should blur sensitive views). */
  locked: boolean;
  /** Milliseconds remaining until the idle lock, null when unknown. */
  remainingIdleMs: number | null;
  /** Report activity manually (also wired to DOM events automatically). */
  reportActivity: () => void;
  /** Re-authenticate and unlock (call after PIN/biometric succeeds). */
  reauthenticate: () => Promise<boolean>;
  /** Lock the session immediately. */
  lock: () => Promise<void>;
  /** Full logout (purge memory credentials). */
  purgeAndLogout: () => void;
}

export function useSessionActivityMonitor(
  options: UseSessionActivityMonitorOptions = {},
): UseSessionActivityMonitorReturn {
  const {
    idleLockMs = DEFAULT_IDLE_LOCK_MS,
    extendedIdleMs = DEFAULT_EXTENDED_IDLE_MS,
    onPurged,
    onLocked,
    onUnlocked,
    url = API_BASE_URL,
  } = options;

  const [locked, setLocked] = useState(false);
  const [remainingIdleMs, setRemainingIdleMs] = useState<number | null>(null);

  const lastActivityRef = useRef<number>(Date.now());
  const lastPostRef = useRef<number>(0);
  const lockedRef = useRef(false);
  const callbacksRef = useRef({ onPurged, onLocked, onUnlocked });
  callbacksRef.current = { onPurged, onLocked, onUnlocked };

  const getToken = (): string | null =>
    localStorage.getItem('token') ?? localStorage.getItem('auth_token');

  const reportActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (lockedRef.current) {
      return; // Locked sessions are only resumed via re-authentication.
    }
    setRemainingIdleMs(idleLockMs);

    const token = getToken();
    if (!token) {
      return;
    }
    // Throttle network writes.
    const now = Date.now();
    if (now - lastPostRef.current < ACTIVITY_POST_THROTTLE_MS) {
      return;
    }
    lastPostRef.current = now;
    fetch(`${url}/auth/session/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {
      // Non-fatal: the client-side timer still protects the terminal.
    });
  }, [idleLockMs, url]);

  const lock = useCallback(async () => {
    lockedRef.current = true;
    setLocked(true);
    callbacksRef.current.onLocked?.();
    const token = getToken();
    if (token) {
      fetch(`${url}/auth/session/lock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  }, [url]);

  const reauthenticate = useCallback(async (): Promise<boolean> => {
    const token = getToken();
    if (!token) {
      return false;
    }
    try {
      const res = await fetch(`${url}/auth/session/unlock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // 423 = purged by extended idle — the session is gone.
        callbacksRef.current.onPurged?.();
        return false;
      }
      lockedRef.current = false;
      setLocked(false);
      lastActivityRef.current = Date.now();
      callbacksRef.current.onUnlocked?.();
      return true;
    } catch {
      return false;
    }
  }, [url]);

  const purgeAndLogout = useCallback(() => {
    const token = getToken();
    if (token) {
      fetch(`${url}/auth/session/purge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    // Clear memory credentials and any sensitive state.
    localStorage.removeItem('token');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    sessionStorage.clear();
    callbacksRef.current.onPurged?.();
  }, [url]);

  useEffect(() => {
    // DOM activity listeners.
    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'wheel',
      'pointerdown',
    ];
    const handler = (): void => reportActivity();
    for (const event of events) {
      window.addEventListener(event, handler, { passive: true });
    }

    // Idle watchdog: lock after `idleLockMs`, purge after `extendedIdleMs`.
    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      setRemainingIdleMs(Math.max(0, idleLockMs - idle));

      if (!lockedRef.current && idle >= idleLockMs) {
        void lock();
      } else if (lockedRef.current && idle >= extendedIdleMs) {
        purgeAndLogout();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, handler);
      }
      clearInterval(interval);
    };
  }, [reportActivity, lock, purgeAndLogout, idleLockMs, extendedIdleMs]);

  return {
    locked,
    remainingIdleMs,
    reportActivity,
    reauthenticate,
    lock,
    purgeAndLogout,
  };
}
