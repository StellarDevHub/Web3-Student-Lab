'use client';

import { flushOfflineSyncQueue, registerOnlineSync } from '@/lib/offline-sync';
import { CORE_OFFLINE_URLS, prefetchOfflineUrls } from '@/lib/service-worker-sync';
import { useEffect } from 'react';

export function OfflineSyncHandler() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => {
          // Proactively cache core learning routes so lessons and the
          // playground stay readable when the network drops later.
          prefetchOfflineUrls(CORE_OFFLINE_URLS);
        })
        .catch((err) => {
          console.error('[SW Registration] Failed:', err);
        });
    }

    const cleanup = registerOnlineSync();

    if (navigator.onLine) {
      flushOfflineSyncQueue().catch((error) => {
        console.error('[OfflineSyncHandler] Failed to flush queued requests:', error);
      });
    }

    return cleanup;
  }, []);

  return null;
}
