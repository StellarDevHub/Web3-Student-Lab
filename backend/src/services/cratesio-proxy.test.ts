import { describe, expect, it } from 'vitest';
import { compatibilityWarnings, crateCacheKey, createCratesIoProvider } from './cratesio-proxy.js';

describe('crates.io proxy (issue #1127)', () => {
  it('warns when a crate is incompatible with an older soroban-sdk', () => {
    const warnings = compatibilityWarnings([
      { name: 'soroban-sdk', version: '18.0.0' },
      { name: 'soroban-auth', version: '20.0.0' },
    ]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('soroban-auth');
  });

  it('produces no warnings when there is no poroblem combination', () => {
    const warnings = compatibilityWarnings([
      { name: 'soroban-sdk', version: '26.1.0' },
      { name: 'soroban-auth', version: '26.1.0' },
    ]);
    // sdk 26 >= minSdk 20 and <= maxSdk 99 → no warning.
    expect(warnings).toEqual([]);
  });

  it('returns nothing when soroban-sdk is absent', () => {
    expect(compatibilityWarnings([{ name: 'serde', version: '1.0.0' }])).toEqual([]);
  });

  it('builds a deterministic, namespaced cache key', () => {
    expect(crateCacheKey('soroban-sdk')).toBe('cratesio:soroban-sdk');
  });

  it('provider disabled gate falls back to curated snapshot synchronously', () => {
    const provider = createCratesIoProvider({ enabled: false });
    // soroban-sdk is in the curated snapshot.
    expect(provider.getLatestVersion('soroban-sdk')).toBeDefined();
    // unknown crate → undefined (fail-safe).
    expect(provider.getLatestVersion('does-not-exist-crate-xyz')).toBeUndefined();
  });
});