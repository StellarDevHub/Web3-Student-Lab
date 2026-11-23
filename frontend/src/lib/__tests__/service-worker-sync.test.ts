import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  CORE_OFFLINE_URLS,
  SYNC_TAG,
  isBackgroundSyncSupported,
  prefetchOfflineUrls,
  requestBackgroundSync,
} from '../service-worker-sync';

describe('service-worker-sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the shared sync tag and core offline routes', () => {
    expect(SYNC_TAG).toBe('w3sl-sync');
    expect(CORE_OFFLINE_URLS).toContain('/offline');
    expect(CORE_OFFLINE_URLS.length).toBeGreaterThan(0);
  });

  it('reports Background Sync unsupported without a worker', () => {
    expect(isBackgroundSyncSupported()).toBe(false);
    expect(navigator.serviceWorker).toBeUndefined();
  });

  it('requestBackgroundSync falls back to false when unsupported', async () => {
    await expect(requestBackgroundSync()).resolves.toBe(false);
  });

  it('prefetchOfflineUrls no-ops without a controller', () => {
    expect(() => prefetchOfflineUrls(['/courses'])).not.toThrow();
  });

  it('registers the sync tag when supported', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { ready: Promise.resolve({ sync: { register } }) },
    });

    await expect(requestBackgroundSync()).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith('w3sl-sync');
  });
});
