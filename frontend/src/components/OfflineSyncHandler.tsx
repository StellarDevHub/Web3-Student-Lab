'use client';

import { flushOfflineSyncQueue, registerOnlineSync } from '@/lib/offline-sync';
import { useEffect } from 'react';

export function OfflineSyncHandler() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
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

