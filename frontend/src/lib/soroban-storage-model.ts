/**
 * soroban-storage-model.ts — Soroban storage tiers, TTL lifecycles, and rent
 * arithmetic for the storage visualiser (Issue #1162).
 *
 * # The distinction students get wrong
 *
 * "Temporary vs Persistent" sounds like a difference of duration. It is not —
 * both have a TTL and both expire. The difference is **what expiry means**:
 *
 *   - A **Temporary** entry that expires is *deleted*. The data is gone. It
 *     cannot be restored, and reading the key afterwards behaves as if it was
 *     never written.
 *   - A **Persistent** entry that expires is *archived*. The data still exists
 *     and can be brought back with `restore`, at a cost.
 *
 * That is why "use Temporary to save money" is only safe for data you can
 * recompute. Losing a cached price feed is a re-fetch; losing a balance is an
 * incident.
 *
 * **Instance** storage is a third case that behaves differently again: it lives
 * inside the contract instance entry, so every key shares one TTL. Extending
 * any of it extends all of it, and if the instance is archived the contract
 * itself is unreachable until restored.
 *
 * # On the numbers
 *
 * The fee rates below are network parameters, not constants. They are read from
 * the ledger config and have changed between protocol versions. They are
 * exported and overridable so the calculator can be pointed at current values
 * rather than quietly drifting out of date.
 */

export type StorageTier = 'instance' | 'temporary' | 'persistent';

/** What happens when an entry's TTL runs out. */
export type ExpiryBehaviour = 'deleted' | 'archived';

export interface TierProfile {
  tier: StorageTier;
  label: string;
  expiryBehaviour: ExpiryBehaviour;
  /** Can the data be recovered after expiry? */
  restorable: boolean;
  /** Do all keys in this tier share a single TTL? */
  sharedTtl: boolean;
  maxTtlLedgers: number;
  description: string;
  useWhen: string;
  avoidWhen: string;
}

/** ~5 seconds per ledger on Stellar. */
export const LEDGERS_PER_DAY = 17_280;

/**
 * Network fee parameters. Defaults approximate Stellar mainnet; override with
 * live values from the ledger config for a real projection.
 */
export interface RentParameters {
  /** Stroops per byte per ledger for persistent entries. */
  persistentRentRateStroops: number;
  /** Stroops per byte per ledger for temporary entries. */
  temporaryRentRateStroops: number;
  /** Flat write fee per entry, in stroops. */
  writeFeeStroops: number;
  /** Flat cost to restore one archived entry, in stroops. */
  restoreFeeStroops: number;
  /** Bytes of overhead the ledger adds to every entry. */
  entryOverheadBytes: number;
}

export const DEFAULT_RENT_PARAMETERS: RentParameters = {
  persistentRentRateStroops: 0.0002,
  temporaryRentRateStroops: 0.00002,
  writeFeeStroops: 1_000,
  restoreFeeStroops: 40_000,
  entryOverheadBytes: 48,
};

export const STROOPS_PER_XLM = 10_000_000;

export const TIER_PROFILES: Record<StorageTier, TierProfile> = {
  instance: {
    tier: 'instance',
    label: 'Instance',
    expiryBehaviour: 'archived',
    restorable: true,
    sharedTtl: true,
    // Instance data shares the contract instance's TTL cap.
    maxTtlLedgers: LEDGERS_PER_DAY * 30,
    description:
      'Stored inside the contract instance entry. Every key shares one TTL, so extending any of it extends all of it.',
    useWhen: 'Small, global configuration that the contract always needs: admin address, fee settings, a version number.',
    avoidWhen:
      'Anything per-user or unbounded. It all shares one entry, so it grows the instance and everyone pays to extend it.',
  },
  temporary: {
    tier: 'temporary',
    label: 'Temporary',
    expiryBehaviour: 'deleted',
    restorable: false,
    sharedTtl: false,
    maxTtlLedgers: LEDGERS_PER_DAY * 1,
    description:
      'Cheapest tier. When the TTL runs out the entry is deleted outright — there is no restore, and the data is unrecoverable.',
    useWhen: 'Data you can recompute or re-fetch: price cache, nonce within a session, short-lived rate-limit counters.',
    avoidWhen:
      'Anything you cannot reconstruct. Balances, ownership, and history must never live here — expiry is silent data loss.',
  },
  persistent: {
    tier: 'persistent',
    label: 'Persistent',
    expiryBehaviour: 'archived',
    restorable: true,
    sharedTtl: false,
    maxTtlLedgers: LEDGERS_PER_DAY * 30,
    description:
      'Most expensive tier. On expiry the entry is archived rather than deleted, and can be brought back with restore.',
    useWhen: 'State of record: balances, ownership, anything whose loss would be a correctness bug.',
    avoidWhen: 'Large caches you could rebuild — you are paying archival guarantees for data that does not need them.',
  },
};

export interface StorageEntry {
  id: string;
  key: string;
  tier: StorageTier;
  /** Payload size, excluding ledger overhead. */
  sizeBytes: number;
  /** Ledger at which the entry was created or last extended. */
  createdAtLedger: number;
  /** Ledger at which it expires. */
  expiresAtLedger: number;
}

export type EntryState = 'live' | 'expired-archived' | 'expired-deleted';

/** Billable size: payload plus the ledger's per-entry overhead. */
export function billableBytes(entry: Pick<StorageEntry, 'sizeBytes'>, params = DEFAULT_RENT_PARAMETERS): number {
  return entry.sizeBytes + params.entryOverheadBytes;
}

/** Ledgers remaining before expiry; never negative. */
export function ledgersRemaining(entry: StorageEntry, currentLedger: number): number {
  return Math.max(0, entry.expiresAtLedger - currentLedger);
}

/**
 * What has happened to this entry at `currentLedger`.
 *
 * The tier determines the *kind* of expiry, which is the whole lesson — the
 * same elapsed time deletes a temporary entry and archives a persistent one.
 */
export function entryState(entry: StorageEntry, currentLedger: number): EntryState {
  if (currentLedger < entry.expiresAtLedger) return 'live';
  return TIER_PROFILES[entry.tier].expiryBehaviour === 'deleted'
    ? 'expired-deleted'
    : 'expired-archived';
}

export interface RentQuote {
  billableBytes: number;
  ledgers: number;
  ratePerBytePerLedger: number;
  rentStroops: number;
  writeStroops: number;
  totalStroops: number;
  totalXlm: number;
}

/**
 * Cost of holding an entry for `ledgers`.
 *
 * Instance entries are billed at the persistent rate — they are archived, not
 * deleted, and priced accordingly. The saving from instance storage is that one
 * entry covers many keys, not a cheaper rate.
 */
export function quoteRent(
  sizeBytes: number,
  tier: StorageTier,
  ledgers: number,
  params: RentParameters = DEFAULT_RENT_PARAMETERS
): RentQuote {
  const bytes = sizeBytes + params.entryOverheadBytes;
  const rate =
    tier === 'temporary' ? params.temporaryRentRateStroops : params.persistentRentRateStroops;

  const rentStroops = bytes * rate * Math.max(0, ledgers);
  const writeStroops = params.writeFeeStroops;
  const totalStroops = rentStroops + writeStroops;

  return {
    billableBytes: bytes,
    ledgers,
    ratePerBytePerLedger: rate,
    rentStroops,
    writeStroops,
    totalStroops,
    totalXlm: totalStroops / STROOPS_PER_XLM,
  };
}

/** Convenience wrapper for quoting in days rather than ledgers. */
export function quoteRentForDays(
  sizeBytes: number,
  tier: StorageTier,
  days: number,
  params: RentParameters = DEFAULT_RENT_PARAMETERS
): RentQuote {
  return quoteRent(sizeBytes, tier, Math.round(days * LEDGERS_PER_DAY), params);
}

export interface ExtendResult {
  ok: boolean;
  reason?: string;
  entry: StorageEntry;
  quote?: RentQuote;
}

/**
 * `extend_ttl` — push the expiry further out.
 *
 * Two rules that surprise people, both modelled here:
 *
 * 1. Extension is measured **from the current ledger**, not added to whatever
 *    remains. Calling it repeatedly does not stack.
 * 2. It cannot rescue an entry that has already expired. A temporary entry is
 *    gone; a persistent one must be `restore`d first. Extending is not a
 *    substitute for restoring, and treating it as one is the bug that turns a
 *    missed extension into an outage.
 */
export function extendTtl(
  entry: StorageEntry,
  currentLedger: number,
  extendToLedgers: number,
  params: RentParameters = DEFAULT_RENT_PARAMETERS
): ExtendResult {
  const state = entryState(entry, currentLedger);

  if (state === 'expired-deleted') {
    return { ok: false, reason: 'Entry was deleted at expiry; temporary storage cannot be restored.', entry };
  }
  if (state === 'expired-archived') {
    return { ok: false, reason: 'Entry is archived. Call restore before extending.', entry };
  }

  const profile = TIER_PROFILES[entry.tier];
  const capped = Math.min(extendToLedgers, profile.maxTtlLedgers);
  const newExpiry = currentLedger + capped;

  // Never shorten a TTL: extend_ttl is a floor, not an assignment.
  if (newExpiry <= entry.expiresAtLedger) {
    return {
      ok: true,
      reason: 'Already live beyond the requested TTL; extend_ttl is a no-op.',
      entry,
      quote: quoteRent(entry.sizeBytes, entry.tier, 0, params),
    };
  }

  const additionalLedgers = newExpiry - entry.expiresAtLedger;

  return {
    ok: true,
    entry: { ...entry, expiresAtLedger: newExpiry },
    quote: quoteRent(entry.sizeBytes, entry.tier, additionalLedgers, params),
  };
}

export interface RestoreResult {
  ok: boolean;
  reason?: string;
  entry: StorageEntry;
  costStroops?: number;
  costXlm?: number;
}

/**
 * `restore` — bring an archived entry back.
 *
 * Only meaningful for tiers that archive. A temporary entry that expired was
 * deleted, and no amount of fee brings it back — which is the single most
 * important consequence of choosing that tier.
 */
export function restoreEntry(
  entry: StorageEntry,
  currentLedger: number,
  restoreForLedgers: number,
  params: RentParameters = DEFAULT_RENT_PARAMETERS
): RestoreResult {
  const state = entryState(entry, currentLedger);

  if (state === 'live') {
    return { ok: false, reason: 'Entry is live; nothing to restore.', entry };
  }
  if (state === 'expired-deleted') {
    return { ok: false, reason: 'Temporary entries are deleted at expiry and cannot be restored.', entry };
  }

  const rent = quoteRent(entry.sizeBytes, entry.tier, restoreForLedgers, params);
  const totalStroops = rent.rentStroops + params.restoreFeeStroops;

  return {
    ok: true,
    entry: { ...entry, createdAtLedger: currentLedger, expiresAtLedger: currentLedger + restoreForLedgers },
    costStroops: totalStroops,
    costXlm: totalStroops / STROOPS_PER_XLM,
  };
}

/**
 * Compare what the same data costs in each tier over the same window.
 *
 * The comparison is the point: temporary looks dramatically cheaper until you
 * account for what expiry does, which is why the result carries the behaviour
 * alongside the number.
 */
export function compareTiers(
  sizeBytes: number,
  ledgers: number,
  params: RentParameters = DEFAULT_RENT_PARAMETERS
): Array<{ tier: StorageTier; quote: RentQuote; expiryBehaviour: ExpiryBehaviour; restorable: boolean }> {
  return (Object.keys(TIER_PROFILES) as StorageTier[]).map((tier) => ({
    tier,
    quote: quoteRent(sizeBytes, tier, ledgers, params),
    expiryBehaviour: TIER_PROFILES[tier].expiryBehaviour,
    restorable: TIER_PROFILES[tier].restorable,
  }));
}

/** Advance a whole entry set to a ledger, reporting each entry's fate. */
export function simulateToLedger(
  entries: StorageEntry[],
  targetLedger: number
): Array<{ entry: StorageEntry; state: EntryState; ledgersRemaining: number }> {
  return entries.map((entry) => ({
    entry,
    state: entryState(entry, targetLedger),
    ledgersRemaining: ledgersRemaining(entry, targetLedger),
  }));
}

/** Worked `extend_ttl` / `restore` snippets, shown alongside the diagram. */
export const CODE_EXAMPLES: Record<StorageTier, { extend: string; note: string }> = {
  instance: {
    extend: `// Instance storage shares ONE TTL across every key it holds.
// Extending here extends all of it - and if the instance is
// archived, the contract itself is unreachable until restored.
env.storage()
    .instance()
    .extend_ttl(THRESHOLD_LEDGERS, EXTEND_TO_LEDGERS);`,
    note: 'Bump the instance on entry points that are called regularly, so an active contract never drifts toward archival.',
  },
  temporary: {
    extend: `// Temporary entries are DELETED at expiry - there is no restore.
// Only put data here that you can recompute.
env.storage()
    .temporary()
    .extend_ttl(&key, THRESHOLD_LEDGERS, EXTEND_TO_LEDGERS);`,
    note: 'If losing this entry would be a correctness bug rather than a cache miss, it is in the wrong tier.',
  },
  persistent: {
    extend: `// Extend when the remaining TTL drops below the threshold.
// extend_ttl is a no-op if the entry is already live beyond
// the target, so this is cheap to call on every access.
env.storage()
    .persistent()
    .extend_ttl(&key, THRESHOLD_LEDGERS, EXTEND_TO_LEDGERS);

// Already archived? extend_ttl will not help - restore first.
// (Restoration is submitted as a separate operation.)`,
    note: 'The common bug: extending only on write. A read-heavy entry that is never written will archive while in active use.',
  },
};
