import logger from '../utils/logger.js';
import {
  curatedRegistryProvider,
  type DependencyRegistryProvider,
} from '../config/dependency-registry.js';

export interface CargoTomlDependency {
  name: string;
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  updateType: 'major' | 'minor' | 'patch' | 'none';
  releaseNotes?: string;
}

export interface DependencyCheckResult {
  dependencies: CargoTomlDependency[];
  outdatedCount: number;
  checkedAt: string;
  cargoTomlHash: string;
}

export interface DependencyUpdateResult {
  updated: string[];
  failed: string[];
  suggestedCargoToml: string;
}

export type VersionUpdateType = 'major' | 'minor' | 'patch' | 'none';

/**
 * Raised when the dependency registry provider cannot resolve versions for an
 * update request. Carries a stable `code` so callers can surface an actionable
 * message instead of a generic failure.
 */
export class DependencyServiceError extends Error {
  constructor(
    public readonly code: 'DEPENDENCY_REGISTRY_UNAVAILABLE',
    message: string
  ) {
    super(message);
    this.name = 'DependencyServiceError';
  }
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

/**
 * Matches `[v]major[.minor[.patch]][-prerelease][+build]`.
 * Major is required; minor/patch default to 0; prerelease and build metadata
 * identifiers follow semver's [0-9A-Za-z-] character set.
 */
const SEMVER_PATTERN =
  /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseSemver(input: string): ParsedSemver | null {
  if (typeof input !== 'string' || input.trim() === '') return null;
  const match = input.trim().match(SEMVER_PATTERN);
  if (!match) return null;

  const major = Number(match[1]);
  if (!Number.isSafeInteger(major) || major < 0) return null;
  const minor = match[2] !== undefined ? Number(match[2]) : 0;
  if (!Number.isSafeInteger(minor) || minor < 0) return null;
  const patch = match[3] !== undefined ? Number(match[3]) : 0;
  if (!Number.isSafeInteger(patch) || patch < 0) return null;
  const prerelease = match[4] !== undefined ? match[4].split('.') : [];

  return { major, minor, patch, prerelease };
}

/**
 * Compare two prerelease identifier lists per semver rules:
 * a list with no prerelease is the full release (sorts after any prerelease);
 * numeric identifiers sort before alphanumeric ones, numeric identifiers
 * compare numerically, alphanumeric identifiers compare lexically, and a
 * shorter list sorts before a longer one when all shared parts are equal.
 */
function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const aPart = a[i];
    const bPart = b[i];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;

    const aNumeric = /^\d+$/.test(aPart) ? Number(aPart) : null;
    const bNumeric = /^\d+$/.test(bPart) ? Number(bPart) : null;
    if (aNumeric !== null && bNumeric !== null) {
      if (aNumeric !== bNumeric) return aNumeric < bNumeric ? -1 : 1;
      continue;
    }
    if (aNumeric !== null) return -1;
    if (bNumeric !== null) return 1;
    if (aPart !== bPart) return aPart < bPart ? -1 : 1;
  }
  return 0;
}

/**
 * Classify the update level needed to move from `current` to `latest`.
 *
 * Handles prerelease suffixes (`1.2.0-beta.1`), build metadata (`1.2.0+build`),
 * optional `v` prefixes, and short forms such as `1.2`. A prerelease-only
 * difference is treated as a patch-level change. Malformed or unparseable
 * input returns `'none'` and never throws, so a bad registry entry cannot
 * break dependency checks.
 */
export function compareVersions(current: string, latest: string): VersionUpdateType {
  const from = parseSemver(current);
  const to = parseSemver(latest);
  if (!from || !to) return 'none';

  if (to.major > from.major) return 'major';
  if (to.major < from.major) return 'none';
  if (to.minor > from.minor) return 'minor';
  if (to.minor < from.minor) return 'none';
  if (to.patch > from.patch) return 'patch';
  if (to.patch < from.patch) return 'none';
  if (comparePrerelease(from.prerelease, to.prerelease) < 0) return 'patch';
  return 'none';
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Parse dependency lines from a Cargo.toml content string.
 * Handles both `name = "version"` and `name = { version = "version", ... }` formats.
 */
export function parseCargoTomlDependencies(cargoToml: string): Array<{ name: string; version: string }> {
  const deps: Array<{ name: string; version: string }> = [];
  const inDepSection = /^\[dependencies\]/m.test(cargoToml);
  if (!inDepSection) return deps;

  const sectionMatch = cargoToml.match(/\[dependencies\]([\s\S]*?)(?=\n\[|$)/);
  if (!sectionMatch) return deps;

  const section = sectionMatch[1] ?? '';
  const lines = section.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Simple: name = "version"
    const simpleMatch = trimmed.match(/^([\w-]+)\s*=\s*"([^"]+)"/);
    if (simpleMatch) {
      deps.push({ name: simpleMatch[1]!, version: simpleMatch[2]! });
      continue;
    }

    // Inline table: name = { version = "...", ... }
    const tableMatch = trimmed.match(/^([\w-]+)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/);
    if (tableMatch) {
      deps.push({ name: tableMatch[1]!, version: tableMatch[2]! });
    }
  }

  return deps;
}

export async function checkDependencies(
  cargoToml: string,
  registry: DependencyRegistryProvider = curatedRegistryProvider
): Promise<DependencyCheckResult> {
  const parsed = parseCargoTomlDependencies(cargoToml);
  const cargoTomlHash = simpleHash(cargoToml);

  const dependencies: CargoTomlDependency[] = parsed.map(({ name, version }) => {
    let latestVersion: string | undefined;
    let releaseNotes: string | undefined;
    try {
      latestVersion = registry.getLatestVersion(name);
      releaseNotes = registry.getReleaseNotes(name);
    } catch (error) {
      // A failing registry provider must never break dependency checks.
      logger.warn(`Dependency registry provider failed for crate "${name}"`, error);
    }
    latestVersion ??= version;
    const updateType = compareVersions(version, latestVersion);
    return {
      name,
      currentVersion: version,
      latestVersion,
      isOutdated: updateType !== 'none',
      updateType,
      ...(releaseNotes ? { releaseNotes } : {}),
    };
  });

  const outdatedCount = dependencies.filter((d) => d.isOutdated).length;

  logger.info('Dependency check completed', {
    cargoTomlHash,
    totalDeps: dependencies.length,
    outdatedCount,
  });

  return {
    dependencies,
    outdatedCount,
    checkedAt: new Date().toISOString(),
    cargoTomlHash,
  };
}

export async function updateDependencies(
  cargoToml: string,
  dependenciesToUpdate: string[],
  registry: DependencyRegistryProvider = curatedRegistryProvider
): Promise<DependencyUpdateResult> {
  const parsed = parseCargoTomlDependencies(cargoToml);
  const updated: string[] = [];
  const failed: string[] = [];
  const registryFailures: string[] = [];
  let updatedCargoToml = cargoToml;

  for (const depName of dependenciesToUpdate) {
    const dep = parsed.find((d) => d.name === depName);
    if (!dep) {
      failed.push(depName);
      continue;
    }
    let latestVersion: string | undefined;
    try {
      latestVersion = registry.getLatestVersion(dep.name);
    } catch (error) {
      registryFailures.push(depName);
      logger.warn(`Dependency registry provider failed for crate "${depName}"`, error);
      continue;
    }
    if (!latestVersion) {
      failed.push(depName);
      continue;
    }
    const escapedName = depName.replace(/[-]/g, '\\-');
    const escapedVersion = dep.version.replace(/\./g, '\\.');
    // Replace simple: name = "version"
    updatedCargoToml = updatedCargoToml.replace(
      new RegExp(`(${escapedName}\\s*=\\s*)"${escapedVersion}"`, 'g'),
      `$1"${latestVersion}"`
    );
    // Replace inline table: name = { version = "version", ... }
    updatedCargoToml = updatedCargoToml.replace(
      new RegExp(`(${escapedName}\\s*=\\s*\\{[^}]*version\\s*=\\s*)"${escapedVersion}"`, 'g'),
      `$1"${latestVersion}"`
    );
    updated.push(depName);
  }

  if (registryFailures.length > 0) {
    throw new DependencyServiceError(
      'DEPENDENCY_REGISTRY_UNAVAILABLE',
      `Could not resolve the latest version of: ${registryFailures.join(', ')}. ` +
        'The dependency registry is temporarily unavailable; please retry the update later.'
    );
  }

  logger.info('Dependency update completed', {
    requested: dependenciesToUpdate.length,
    updated: updated.length,
    failed: failed.length,
  });

  return { updated, failed, suggestedCargoToml: updatedCargoToml };
}
