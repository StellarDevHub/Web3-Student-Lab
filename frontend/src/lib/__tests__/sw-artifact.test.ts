import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract test for the `public/sw.js` artifact (FE-HARD-34): the app
 * registers `/sw.js` in production, so the file must exist and implement the
 * lifecycle, caching, and Background Sync surface the client relies on.
 */
describe('service worker artifact', () => {
  const swPath = resolve(process.cwd(), 'public/sw.js');
  const source = existsSync(swPath) ? readFileSync(swPath, 'utf8') : '';

  it('exists', () => {
    expect(existsSync(swPath)).toBe(true);
  });

  it('implements install/activate/fetch lifecycle with versioned caches', () => {
    for (const snippet of [
      "addEventListener('install'",
      "addEventListener('activate'",
      "addEventListener('fetch'",
      'w3sl-app-v1',
      'w3sl-lessons-v1',
      'w3sl-templates-v1',
    ]) {
      expect(source).toContain(snippet);
    }
  });

  it('falls back to the offline page for navigations', () => {
    expect(source).toContain('/offline');
    expect(source).toContain("request.mode === 'navigate'");
  });

  it('implements Background Sync replay and client messaging', () => {
    for (const snippet of [
      "addEventListener('sync'",
      'w3sl-sync',
      'FLUSH_QUEUE',
      'SKIP_WAITING',
      'CACHE_URLS',
    ]) {
      expect(source).toContain(snippet);
    }
  });
});
