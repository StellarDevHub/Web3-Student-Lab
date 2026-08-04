/**
 * Cargo dependency registry — curated snapshot provider.
 *
 * This module is the single documented source of truth for the latest known
 * versions of the Soroban/Stellar crates used by the dependency-update
 * service (issue #881). Live update execution in
 * `dependency-update.service.ts` only consumes the provider interface exported
 * here; it never touches raw data, so the source can be swapped (e.g. for a
 * live crates.io client) without changing service code.
 *
 * --- Ownership ---
 * Maintained by the Web3 Student Lab backend/playground team.
 * Last reviewed: 2026-07-20.
 *
 * --- Source ---
 * crates.io registry metadata: https://crates.io/api/v1/crates/<crate>
 *
 * --- Refresh strategy ---
 * This is a CURATED SNAPSHOT, not a live registry. It is refreshed on demand
 * by running:
 *
 *   cd backend && npm run refresh:dependency-registry
 *
 * `scripts/refresh-dependency-registry.ts` queries crates.io for every crate
 * below and prints an updated snapshot for maintainers to review and commit.
 *
 * --- Failure handling ---
 * Runtime services never depend on crates.io. If an external registry refresh
 * ever fails, the committed snapshot below keeps the application fully
 * functional. The accessor functions are fail-safe: they never throw for
 * unknown or malformed entries.
 */

export interface CrateRegistryEntry {
  /** Latest known stable version of the crate. */
  version: string;
  /** Optional short release notes surfaced to users in dependency checks. */
  releaseNotes?: string;
}

export interface CrateRegistryMetadata {
  /** Team or maintainer responsible for the snapshot. */
  owner: string;
  /** ISO date of the last manual review/refresh of the snapshot. */
  lastReviewed: string;
  /** Where the version data originates. */
  source: string;
  /** How the snapshot is kept up to date. */
  refreshStrategy: string;
}

export const REGISTRY_METADATA: CrateRegistryMetadata = {
  owner: 'Web3 Student Lab backend/playground team',
  lastReviewed: '2026-07-20',
  source: 'crates.io registry metadata (https://crates.io/api/v1/crates/<crate>)',
  refreshStrategy:
    'Curated snapshot. Refresh with `npm run refresh:dependency-registry` (backend) and commit the resulting diff.',
};

/**
 * Curated snapshot of the latest known versions for Soroban/Stellar crates.
 * Do not edit ad hoc — run the refresh script and commit its output.
 */
const CURATED_REGISTRY: Readonly<Record<string, CrateRegistryEntry>> = {
  'soroban-sdk': {
    version: '26.1.0',
    releaseNotes: 'Protocol 26 support, improved storage APIs, and security patches.',
  },
  'soroban-auth': {
    version: '26.1.0',
    releaseNotes: 'Improved authorization framework compatibility with Protocol 26.',
  },
  'stellar-xdr': {
    version: '22.1.0',
    releaseNotes: 'Updated XDR definitions for Stellar Protocol 22.',
  },
  'num-integer': { version: '0.1.46' },
  'num-traits': { version: '0.2.19' },
  serde: {
    version: '1.0.219',
    releaseNotes: 'Performance improvements and new derive macro features.',
  },
  serde_json: { version: '1.0.140' },
  base64: { version: '0.22.1' },
  hex: { version: '0.4.3' },
  sha2: { version: '0.10.9' },
  hmac: { version: '0.12.1' },
  'ed25519-dalek': { version: '2.1.1' },
};

export function getCuratedLatestVersion(crateName: string): string | undefined {
  return CURATED_REGISTRY[crateName]?.version;
}

export function getCuratedReleaseNotes(crateName: string): string | undefined {
  return CURATED_REGISTRY[crateName]?.releaseNotes;
}

/** Returns a copy of the curated snapshot (callers cannot mutate it). */
export function getCrateRegistrySnapshot(): Readonly<Record<string, CrateRegistryEntry>> {
  return { ...CURATED_REGISTRY };
}

/**
 * Contract the dependency-update service relies on. Implementations must be
 * fail-safe for unknown crates (return `undefined`); the service wraps calls
 * in its own guards so a throwing provider can never break the application.
 */
export interface DependencyRegistryProvider {
  getLatestVersion(crateName: string): string | undefined;
  getReleaseNotes(crateName: string): string | undefined;
}

/** Default provider backed by the curated snapshot. */
export const curatedRegistryProvider: DependencyRegistryProvider = {
  getLatestVersion: getCuratedLatestVersion,
  getReleaseNotes: getCuratedReleaseNotes,
};
