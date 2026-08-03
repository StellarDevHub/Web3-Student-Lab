import logger from '../utils/logger.js';

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

// Simulated Soroban/Stellar Rust dependency registry (latest known versions)
const REGISTRY: Record<string, string> = {
  'soroban-sdk': '22.0.7',
  'soroban-auth': '22.0.7',
  'stellar-xdr': '22.1.0',
  'num-integer': '0.1.46',
  'num-traits': '0.2.19',
  'serde': '1.0.219',
  'serde_json': '1.0.140',
  'base64': '0.22.1',
  'hex': '0.4.3',
  'sha2': '0.10.9',
  'hmac': '0.12.1',
  'ed25519-dalek': '2.1.1',
};

const RELEASE_NOTES: Record<string, string> = {
  'soroban-sdk': 'Protocol 22 support, improved storage APIs, and security patches.',
  'stellar-xdr': 'Updated XDR definitions for Stellar Protocol 22.',
  'soroban-auth': 'Improved authorization framework compatibility with Protocol 22.',
  'serde': 'Performance improvements and new derive macro features.',
};

function compareVersions(a: string, b: string): 'major' | 'minor' | 'patch' | 'none' {
  const [aMaj = 0, aMin = 0, aPat = 0] = a.split('.').map(Number);
  const [bMaj = 0, bMin = 0, bPat = 0] = b.split('.').map(Number);
  if (bMaj > aMaj) return 'major';
  if (bMin > aMin) return 'minor';
  if (bPat > aPat) return 'patch';
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

export async function checkDependencies(cargoToml: string): Promise<DependencyCheckResult> {
  const parsed = parseCargoTomlDependencies(cargoToml);
  const cargoTomlHash = simpleHash(cargoToml);

  const dependencies: CargoTomlDependency[] = parsed.map(({ name, version }) => {
    const latestVersion = REGISTRY[name] ?? version;
    const updateType = compareVersions(version, latestVersion);
    const releaseNotes = RELEASE_NOTES[name];
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
  dependenciesToUpdate: string[]
): Promise<DependencyUpdateResult> {
  const parsed = parseCargoTomlDependencies(cargoToml);
  const updated: string[] = [];
  const failed: string[] = [];
  let updatedCargoToml = cargoToml;

  for (const depName of dependenciesToUpdate) {
    const dep = parsed.find((d) => d.name === depName);
    if (!dep) {
      failed.push(depName);
      continue;
    }
    const latestVersion = REGISTRY[dep.name];
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

  logger.info('Dependency update completed', {
    requested: dependenciesToUpdate.length,
    updated: updated.length,
    failed: failed.length,
  });

  return { updated, failed, suggestedCargoToml: updatedCargoToml };
}
