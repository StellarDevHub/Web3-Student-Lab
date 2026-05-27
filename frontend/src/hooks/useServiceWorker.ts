'use client';

import { useCallback, useEffect, useRef } from 'react';

type ServiceWorkerCallback = (event?: Event) => void;
export type ServiceWorkerStatus =
  | 'idle'
  | 'installing'
  | 'installed'
  | 'updating'
  | 'ready'
  | 'error'
  | 'offline';

interface UseServiceWorkerOptions {
  onInstalled?: ServiceWorkerCallback;
  onUpdated?: ServiceWorkerCallback;
  onReady?: ServiceWorkerCallback;
  onError?: (error: Error) => void;
  onOffline?: ServiceWorkerCallback;
  onOnline?: ServiceWorkerCallback;
}

export function useServiceWorker(options: UseServiceWorkerOptions = {}) {
  const swRef = useRef<ServiceWorkerRegistration | null>(null);
  const statusRef = useRef<ServiceWorkerStatus>('idle');

  const registerServiceWorker = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Workers not supported');
      options.onError?.(new Error('Service Workers not supported'));
      return;
    }

    try {
      statusRef.current = 'installing';

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      swRef.current = registration;
      console.log('[SW] Registration successful:', registration);

      // Track service worker state changes
      registration.onupdatefound = () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.onstatechange = () => {
          console.log(`[SW] Worker state: ${newWorker.state}`);

          if (newWorker.state === 'activated') {
            statusRef.current = 'ready';
            options.onReady?.();
          }

          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            statusRef.current = 'updating';
            options.onUpdated?.();
          }
        };
      };

      // Check for updates periodically
      setInterval(() => {
        registration.update().catch((err) => {
          console.error('[SW] Update check failed:', err);
        });
      }, 60000); // Check every minute

      if (registration.active) {
        statusRef.current = 'ready';
        options.onReady?.();
      }

      statusRef.current = 'installed';
      options.onInstalled?.();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SW] Registration failed:', err);
      statusRef.current = 'error';
      options.onError?.(err);
    }
  }, [options]);

  useEffect(() => {
    // Handle online/offline events
    const handleOnline = () => {
      console.log('[SW] Online');
      options.onOnline?.();
    };

    const handleOffline = () => {
      console.log('[SW] Offline');
      options.onOffline?.();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Handle messages from service worker
    const handleMessage = (event: MessageEvent) => {
      const { data } = event;
      console.log('[SW] Message from worker:', data);

      if (data.type === 'OFFLINE') {
        options.onOffline?.();
      }

      if (data.type === 'CACHE_UPDATED') {
        console.log('[SW] Cache updated for:', data.url);
      }

      if (data.type === 'CLIENTS_CLAIMED') {
        console.log('[SW] Service worker claimed all clients');
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);

    // Register service worker on mount
    registerServiceWorker();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [registerServiceWorker, options]);

  const skipWaiting = useCallback(() => {
    if (!swRef.current?.waiting) return;

    const controller = navigator.serviceWorker.controller;
    if (!controller) return;

    // Tell the new service worker to take over
    swRef.current.waiting.postMessage({ type: 'SKIP_WAITING' });

    // Reload page once the new service worker is activated
    let refreshing = false;
    navigator.serviceWorker.oncontrollerchange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
  }, []);

  const unregister = useCallback(async () => {
    if (!swRef.current) return;
    try {
      await swRef.current.unregister();
      console.log('[SW] Service worker unregistered');
      swRef.current = null;
    } catch (error) {
      console.error('[SW] Unregister failed:', error);
    }
  }, []);

  return {
    isSupported: 'serviceWorker' in navigator,
    status: statusRef.current,
    registration: swRef.current,
    skipWaiting,
    unregister,
    isOnline: typeof navigator !== 'undefined' && navigator.onLine,
  };
}
