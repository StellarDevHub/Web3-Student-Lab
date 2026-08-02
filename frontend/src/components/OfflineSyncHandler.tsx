'use client';

import { flushOfflineSyncQueue, registerOnlineSync } from '@/lib/offline-sync';
import { useEffect } from 'react';

export function OfflineSyncHandler() {
  useEffect(() => {
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
