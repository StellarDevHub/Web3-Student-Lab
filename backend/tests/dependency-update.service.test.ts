import { describe, it, expect } from '@jest/globals';
import {
  parseCargoTomlDependencies,
  checkDependencies,
  updateDependencies,
  compareVersions,
  DependencyServiceError,
} from '../src/services/dependency-update.service.js';

const SAMPLE_TOML = `[package]
name = "test-contract"
version = "0.1.0"
edition = "2021"

[dependencies]
soroban-sdk = "21.7.6"
soroban-auth = "21.0.0"
stellar-xdr = "21.2.0"
num-integer = "0.1.44"
serde = { version = "1.0.100", features = ["derive"] }
unknown-crate = "1.0.0"
`;

describe('parseCargoTomlDependencies', () => {
  it('parses simple version strings', () => {
    const deps = parseCargoTomlDependencies(SAMPLE_TOML);
    const names = deps.map((d) => d.name);
    expect(names).toContain('soroban-sdk');
    expect(names).toContain('num-integer');
    expect(names).toContain('unknown-crate');
  });

  it('parses inline table version', () => {
    const deps = parseCargoTomlDependencies(SAMPLE_TOML);
    const serde = deps.find((d) => d.name === 'serde');
    expect(serde).toBeDefined();
    expect(serde?.version).toBe('1.0.100');
  });

  it('returns empty array when no [dependencies] section', () => {
    const result = parseCargoTomlDependencies('[package]\nname = "x"\nversion = "0.1.0"\n');
    expect(result).toEqual([]);
  });
});

describe('checkDependencies', () => {
  it('identifies outdated soroban-sdk', async () => {
    const result = await checkDependencies(SAMPLE_TOML);
    const sdk = result.dependencies.find((d) => d.name === 'soroban-sdk');
    expect(sdk?.isOutdated).toBe(true);
    expect(sdk?.currentVersion).toBe('21.7.6');
    expect(sdk?.latestVersion).toBe('26.1.0');
    expect(sdk?.updateType).toBe('major');
  });

  it('marks unknown-crate as up-to-date (not in registry)', async () => {
    const result = await checkDependencies(SAMPLE_TOML);
    const unknown = result.dependencies.find((d) => d.name === 'unknown-crate');
    expect(unknown?.isOutdated).toBe(false);
    expect(unknown?.updateType).toBe('none');
  });

  it('includes releaseNotes for known deps', async () => {
    const result = await checkDependencies(SAMPLE_TOML);
    const sdk = result.dependencies.find((d) => d.name === 'soroban-sdk');
    expect(typeof sdk?.releaseNotes).toBe('string');
  });

  it('returns outdatedCount and metadata', async () => {
    const result = await checkDependencies(SAMPLE_TOML);
    expect(result.outdatedCount).toBeGreaterThan(0);
    expect(result.checkedAt).toBeDefined();
    expect(result.cargoTomlHash).toBeDefined();
  });

  it('returns 0 outdated when versions are already latest', async () => {
    const latest = '[dependencies]\nsoroban-sdk = "26.1.0"\n';
    const result = await checkDependencies(latest);
    expect(result.outdatedCount).toBe(0);
  });
});

describe('compareVersions', () => {
  it('classifies major, minor, and patch updates', () => {
    expect(compareVersions('21.7.6', '26.1.0')).toBe('major');
    expect(compareVersions('1.2.0', '1.3.0')).toBe('minor');
    expect(compareVersions('1.2.3', '1.2.4')).toBe('patch');
    expect(compareVersions('1.2.3', '1.2.3')).toBe('none');
  });

  it('returns none when the current version is newer than the registry entry', () => {
    expect(compareVersions('27.0.0', '26.1.0')).toBe('none');
    expect(compareVersions('1.3.0', '1.2.9')).toBe('none');
    expect(compareVersions('1.2.5', '1.2.4')).toBe('none');
  });

  it('handles prerelease versions safely', () => {
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe('patch');
    expect(compareVersions('1.2.3', '1.2.3-beta.1')).toBe('none');
    expect(compareVersions('1.2.3-alpha', '1.2.3-beta')).toBe('patch');
    expect(compareVersions('1.2.3-beta.1', '1.2.3-beta.2')).toBe('patch');
    expect(compareVersions('1.2.3-alpha.1', '1.2.3-alpha')).toBe('none');
    expect(compareVersions('1.2.3-beta.1', '1.2.3-alpha.1')).toBe('none');
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe('patch');  });

  it('handles build metadata, v prefixes, and short forms', () => {
    expect(compareVersions('1.2.3+build.5', '1.2.4')).toBe('patch');
    expect(compareVersions('v1.2.3', '1.2.4')).toBe('patch');
    expect(compareVersions('v1.2.3', '1.2.3')).toBe('none');
    expect(compareVersions('1.2', '1.2.0')).toBe('none');
    expect(compareVersions('1.2', '1.3.0')).toBe('minor');
    expect(compareVersions('1', '2.0.0')).toBe('major');
  });

  it('treats malformed input as no update without throwing', () => {
    expect(compareVersions('', '1.2.3')).toBe('none');
    expect(compareVersions('abc', '1.2.3')).toBe('none');
    expect(compareVersions('1.2.3', 'not-a-version')).toBe('none');
    expect(compareVersions('1..3', '1.2.3')).toBe('none');
    expect(compareVersions('*', '1.2.3')).toBe('none');
    expect(compareVersions('1.2.3.4', '1.2.3')).toBe('none');
    expect(compareVersions('1.2.3', '1.2.3.4')).toBe('none');
  });
});

describe('dependency registry provider resilience', () => {
  it('checkDependencies does not break when the registry provider throws', async () => {
    const failingRegistry = {
      getLatestVersion: () => {
        throw new Error('registry unavailable');
      },
      getReleaseNotes: () => {
        throw new Error('registry unavailable');
      },
    };
    const toml = '[dependencies]\nsoroban-sdk = "21.7.6"\n';
    const result = await checkDependencies(toml, failingRegistry);
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0]?.isOutdated).toBe(false);
    expect(result.dependencies[0]?.latestVersion).toBe('21.7.6');
  });

  it('updateDependencies raises an actionable error when the registry provider throws', async () => {
    const failingRegistry = {
      getLatestVersion: () => {
        throw new Error('registry unavailable');
      },
      getReleaseNotes: () => undefined,
    };
    const toml = '[dependencies]\nsoroban-sdk = "21.7.6"\n';
    const error = await updateDependencies(toml, ['soroban-sdk'], failingRegistry).catch((e) => e);
    expect(error).toBeInstanceOf(DependencyServiceError);
    expect((error as DependencyServiceError).code).toBe('DEPENDENCY_REGISTRY_UNAVAILABLE');
    expect((error as Error).message).toContain('soroban-sdk');
  });
});

describe('updateDependencies', () => {
  it('updates a known dependency to latest version', async () => {
    const result = await updateDependencies(SAMPLE_TOML, ['soroban-sdk']);
    expect(result.updated).toContain('soroban-sdk');
    expect(result.failed).not.toContain('soroban-sdk');
    expect(result.suggestedCargoToml).toContain('"26.1.0"');
  });

  it('reports failure for dependency not in registry', async () => {
    const result = await updateDependencies(SAMPLE_TOML, ['does-not-exist']);
    expect(result.failed).toContain('does-not-exist');
    expect(result.updated).not.toContain('does-not-exist');
  });

  it('handles multiple updates in one call', async () => {
    const result = await updateDependencies(SAMPLE_TOML, ['soroban-sdk', 'soroban-auth', 'stellar-xdr']);
    expect(result.updated.length).toBeGreaterThanOrEqual(2);
  });

  it('returns suggestedCargoToml as a non-empty string', async () => {
    const result = await updateDependencies(SAMPLE_TOML, ['soroban-sdk']);
    expect(typeof result.suggestedCargoToml).toBe('string');
    expect(result.suggestedCargoToml.length).toBeGreaterThan(0);
  });
});
