'use client';

/**
 * Client companion to `public/sw.js` (FE-HARD-34).
 *
 * - `requestBackgroundSync()` registers the `w3sl-sync` tag so queued actions
 *   flush on network restoration even if the `online` event was missed.
 * - `prefetchOfflineUrls()` asks the worker to cache lesson/template URLs
 *   visited while online so they stay readable offline.
 */

export const SYNC_TAG = 'w3sl-sync';

/** Core routes worth having offline even before first visit. */
export const CORE_OFFLINE_URLS = ['/offline', '/courses', '/roadmap', '/playground'];

export function isBackgroundSyncSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  return 'SyncManager' in window;
}

async function getReadyRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

type SyncCapableRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

/**
 * Register the Background Sync tag. Returns true when the tag was accepted;
 * false when unsupported — callers must fall back to flushing on `online`.
 */
export async function requestBackgroundSync(): Promise<boolean> {
  try {
    const registration = (await getReadyRegistration()) as SyncCapableRegistration | null;
    if (!registration?.sync?.register) return false;
    await registration.sync.register(SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort prefetch of URLs into the worker's lesson/template caches. */
export function prefetchOfflineUrls(urls: string[]): void {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const controller = navigator.serviceWorker.controller;
    if (!controller) return;
    controller.postMessage({ type: 'CACHE_URLS', urls });
  } catch {
    // Prefetch never blocks learning.
  }
}
