/**
 * Refresh helper for the curated dependency registry (issue #881).
 *
 * Queries crates.io for every crate in the curated snapshot and prints the
 * current vs. newest version for each. Maintainers review the output and
 * commit the updated snapshot in `src/config/dependency-registry.ts`.
 *
 * The application itself never depends on this script or on crates.io — if
 * this refresh fails, the committed snapshot keeps the service functional.
 *
 * Usage:
 *   npm run refresh:dependency-registry   (from backend/)
 *
 * Exit code is 0 when every crate resolved, 1 when one or more failed.
 */
import {
  getCrateRegistrySnapshot,
  REGISTRY_METADATA,
} from '../src/config/dependency-registry.js';

const CRATES_IO_API = 'https://crates.io/api/v1/crates';
const USER_AGENT = 'web3-student-lab-dependency-registry-refresh (backend maintainers)';
const REQUEST_TIMEOUT_MS = 10_000;

interface CratesIoResponse {
  crate?: {
    newest_version?: string;
  };
}

async function fetchNewestVersion(crateName: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${CRATES_IO_API}/${encodeURIComponent(crateName)}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`crates.io responded with HTTP ${res.status}`);
    }
    const data = (await res.json()) as CratesIoResponse;
    return data.crate?.newest_version;
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const snapshot = getCrateRegistrySnapshot();
  const crateNames = Object.keys(snapshot);
  const failures: string[] = [];
  let changed = 0;

  console.log(
    `Refreshing ${crateNames.length} crate(s) from ${REGISTRY_METADATA.source} (owner: ${REGISTRY_METADATA.owner})`
  );
  console.log('');

  for (const name of crateNames) {
    const current = snapshot[name]?.version ?? 'unknown';
    try {
      const newest = await fetchNewestVersion(name);
      if (!newest) {
        throw new Error('crates.io returned no newest_version');
      }
      const status = newest === current ? 'up to date' : 'UPDATE AVAILABLE';
      if (newest !== current) changed += 1;
      console.log(`${name.padEnd(16)} ${current.padEnd(10)} -> ${newest.padEnd(10)} (${status})`);
    } catch (error) {
      failures.push(name);
      console.error(`${name.padEnd(16)} FAILED: ${(error as Error).message}`);
    }
  }

  console.log('');
  if (failures.length > 0) {
    console.error(
      `Refresh incomplete: ${failures.length} crate(s) could not be resolved: ${failures.join(', ')}`
    );
    process.exitCode = 1;
  } else if (changed > 0) {
    console.log(
      `${changed} crate(s) have updates. Review the versions above, then update ` +
        '`src/config/dependency-registry.ts` and commit.'
    );
  } else {
    console.log('All crates are up to date. No changes needed.');
  }
}

main();
