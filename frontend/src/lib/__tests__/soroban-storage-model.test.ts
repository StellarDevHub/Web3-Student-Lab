import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RENT_PARAMETERS,
  LEDGERS_PER_DAY,
  TIER_PROFILES,
  billableBytes,
  compareTiers,
  entryState,
  extendTtl,
  ledgersRemaining,
  quoteRent,
  quoteRentForDays,
  restoreEntry,
  simulateToLedger,
  type StorageEntry,
} from '../soroban-storage-model';

const persistent: StorageEntry = {
  id: 'p',
  key: 'balance',
  tier: 'persistent',
  sizeBytes: 100,
  createdAtLedger: 0,
  expiresAtLedger: 1000,
};

const temporary: StorageEntry = { ...persistent, id: 't', key: 'cache', tier: 'temporary' };

describe('tier semantics', () => {
  it('deletes temporary entries and archives persistent ones', () => {
    // The distinction the whole page exists to teach: same elapsed time,
    // different consequence.
    expect(TIER_PROFILES.temporary.expiryBehaviour).toBe('deleted');
    expect(TIER_PROFILES.temporary.restorable).toBe(false);
    expect(TIER_PROFILES.persistent.expiryBehaviour).toBe('archived');
    expect(TIER_PROFILES.persistent.restorable).toBe(true);
  });

  it('marks instance storage as sharing one TTL', () => {
    expect(TIER_PROFILES.instance.sharedTtl).toBe(true);
  });
});

describe('rent arithmetic', () => {
  it('bills payload plus per-entry overhead', () => {
    expect(billableBytes({ sizeBytes: 0 })).toBe(DEFAULT_RENT_PARAMETERS.entryOverheadBytes);
    expect(quoteRent(1000, 'persistent', 1000).billableBytes).toBe(1048);
  });

  it('charges bytes x rate x ledgers, plus the write fee', () => {
    const quote = quoteRent(1000, 'persistent', 1000);
    expect(quote.rentStroops).toBe(1048 * DEFAULT_RENT_PARAMETERS.persistentRentRateStroops * 1000);
    expect(quote.totalStroops).toBe(quote.rentStroops + DEFAULT_RENT_PARAMETERS.writeFeeStroops);
  });

  it('charges no rent for a zero-ledger window', () => {
    expect(quoteRent(100, 'persistent', 0).rentStroops).toBe(0);
  });

  it('prices temporary below persistent', () => {
    expect(quoteRent(1000, 'temporary', 1000).rentStroops).toBeLessThan(
      quoteRent(1000, 'persistent', 1000).rentStroops
    );
  });

  it('bills instance storage at the persistent rate', () => {
    // Instance entries are archived, not deleted, so they are priced as such.
    // The saving is that one entry covers many keys - not a cheaper rate.
    expect(quoteRent(1000, 'instance', 1000).rentStroops).toBe(
      quoteRent(1000, 'persistent', 1000).rentStroops
    );
  });

  it('converts days to ledgers', () => {
    expect(quoteRentForDays(100, 'persistent', 1).ledgers).toBe(LEDGERS_PER_DAY);
  });
});

describe('lifecycle state', () => {
  it('is live until the expiry ledger', () => {
    expect(entryState(persistent, 999)).toBe('live');
    expect(ledgersRemaining(persistent, 400)).toBe(600);
  });

  it('archives or deletes at expiry depending on the tier', () => {
    expect(entryState(persistent, 1000)).toBe('expired-archived');
    expect(entryState(temporary, 1000)).toBe('expired-deleted');
  });

  it('clamps remaining ledgers at zero', () => {
    expect(ledgersRemaining(persistent, 5000)).toBe(0);
  });

  it('gives the same elapsed time different outcomes per tier', () => {
    const [p, t] = simulateToLedger([persistent, temporary], 1500);
    expect(p.state).toBe('expired-archived');
    expect(t.state).toBe('expired-deleted');
  });
});

describe('extend_ttl', () => {
  it('measures the new expiry from the current ledger, not from the old expiry', () => {
    // Repeated calls do not stack - a common and expensive misunderstanding.
    const result = extendTtl(persistent, 500, 2000);
    expect(result.ok).toBe(true);
    expect(result.entry.expiresAtLedger).toBe(2500);
  });

  it('never shortens a TTL', () => {
    const result = extendTtl(persistent, 500, 100);
    expect(result.entry.expiresAtLedger).toBe(1000);
    expect(result.reason).toMatch(/no-op/);
  });

  it('caps at the tier maximum', () => {
    expect(extendTtl(persistent, 0, 999_999_999).entry.expiresAtLedger).toBe(
      TIER_PROFILES.persistent.maxTtlLedgers
    );
  });

  it('refuses to revive a deleted temporary entry', () => {
    const result = extendTtl(temporary, 1200, 2000);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/cannot be restored/);
  });

  it('directs an archived entry to restore first', () => {
    const result = extendTtl(persistent, 1200, 2000);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/restore/);
  });
});

describe('restore', () => {
  it('brings an archived entry back for a fresh window', () => {
    const result = restoreEntry(persistent, 1200, 1000);
    expect(result.ok).toBe(true);
    expect(result.entry.expiresAtLedger).toBe(2200);
    expect(result.costStroops).toBeGreaterThan(DEFAULT_RENT_PARAMETERS.restoreFeeStroops);
  });

  it('cannot restore a temporary entry at any price', () => {
    // The single most important consequence of choosing that tier.
    const result = restoreEntry(temporary, 1200, 1000);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/deleted/);
  });

  it('refuses to restore a live entry', () => {
    expect(restoreEntry(persistent, 500, 1000).ok).toBe(false);
  });
});

describe('tier comparison', () => {
  it('reports cost alongside what expiry does', () => {
    const rows = compareTiers(500, LEDGERS_PER_DAY);
    const temp = rows.find((r) => r.tier === 'temporary')!;
    const pers = rows.find((r) => r.tier === 'persistent')!;

    expect(rows).toHaveLength(3);
    expect(temp.quote.rentStroops).toBeLessThan(pers.quote.rentStroops);
    // Price alone would make temporary look like the obvious choice; the
    // comparison carries restorability so the trade is visible.
    expect(temp.restorable).toBe(false);
    expect(pers.restorable).toBe(true);
  });
});
