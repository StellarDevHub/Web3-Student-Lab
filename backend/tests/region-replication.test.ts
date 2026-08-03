import {
  orderRegionsByPreference,
  parseRegions,
  resolveActiveRegionName,
} from '../src/config/region.config.js';
import { RegionReplicator, type RedisLike, type RegionClient } from '../src/cache/RegionReplicator.js';

/** Minimal in-memory Redis fake so replication is observable per region. */
function fakeClient(options: { status?: string; failGet?: boolean; failSet?: boolean; latencyMs?: number } = {}) {
  const store = new Map<string, string>();
  return {
    store,
    status: options.status,
    async get(key: string): Promise<string | null> {
      if (options.failGet) throw new Error('region read down');
      await new Promise((r) => setTimeout(r, options.latencyMs || 0));
      return store.has(key) ? store.get(key)! : null;
    },
    async set(key: string, value: string): Promise<unknown> {
      if (options.failSet) throw new Error('region write down');
      await new Promise((r) => setTimeout(r, options.latencyMs || 0));
      store.set(key, value);
      return 'OK';
    },
    async del(key: string): Promise<unknown> {
      store.delete(key);
      return 1;
    },
  };
}

function regions(...clients: Array<{ name: string; client: RedisLike }>): RegionClient[] {
  return clients;
}

describe('region.config (pure)', () => {
  it('parses name@connection pairs, keeping @ inside connection strings', () => {
    const parsed = parseRegions({
      REDIS_REGIONS: 'us-east@redis://user:pw@cache-us:6379, eu-west@cache-eu:6380',
    } as NodeJS.ProcessEnv);
    expect(parsed).toEqual([
      { name: 'us-east', connection: 'redis://user:pw@cache-us:6379' },
      { name: 'eu-west', connection: 'cache-eu:6380' },
    ]);
  });

  it('returns [] when unset and skips malformed/duplicate entries', () => {
    expect(parseRegions({} as NodeJS.ProcessEnv)).toEqual([]);
    const parsed = parseRegions({
      REDIS_REGIONS: 'broken,@nohost,name@,us@h:1,us@h:2',
    } as NodeJS.ProcessEnv);
    expect(parsed).toEqual([{ name: 'us', connection: 'h:1' }]);
  });

  it('resolves the active region from env, else the first region', () => {
    const list = parseRegions({ REDIS_REGIONS: 'us@h:1,eu@h:2' } as NodeJS.ProcessEnv);
    expect(resolveActiveRegionName(list, { REDIS_ACTIVE_REGION: 'eu' } as NodeJS.ProcessEnv)).toBe('eu');
    expect(resolveActiveRegionName(list, { REDIS_ACTIVE_REGION: 'xx' } as NodeJS.ProcessEnv)).toBe('us');
    expect(resolveActiveRegionName([], {} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('orders healthy regions with the active first', () => {
    const names = ['us', 'eu', 'ap'];
    expect(orderRegionsByPreference(names, 'eu', () => true)).toEqual(['eu', 'us', 'ap']);
    expect(orderRegionsByPreference(names, 'eu', (n) => n !== 'eu')).toEqual(['us', 'ap']);
  });
});

describe('RegionReplicator', () => {
  it('synchronizes a key modified in one region across all replica regions', async () => {
    const us = fakeClient();
    const eu = fakeClient();
    const ap = fakeClient();
    const replicator = new RegionReplicator(
      regions({ name: 'us', client: us }, { name: 'eu', client: eu }, { name: 'ap', client: ap }),
      'us'
    );

    const result = await replicator.set('course:1', 'cached-value', 900);

    const usEntry = JSON.parse(us.store.get('course:1')!);
    expect(usEntry.v).toBe('cached-value');
    expect(usEntry.op).toBe('set');

    expect(eu.store.get('course:1')).not.toBeNull();
    expect(ap.store.get('course:1')).not.toBeNull();

    expect(result.origin).toBe('us');
    expect(result.replicated.sort()).toEqual(['ap', 'eu', 'us']);
    expect(result.failed).toEqual([]);
    expect(result.sequence).toBeGreaterThan(0);
  });

  it('still replicates to healthy regions when one replica is down', async () => {
    const us = fakeClient();
    const eu = fakeClient({ failSet: true });
    const replicator = new RegionReplicator(
      regions({ name: 'us', client: us }, { name: 'eu', client: eu }),
      'us'
    );

    const result = await replicator.set('k', 'v');
    expect(us.store.get('k')).not.toBeNull();
    expect(result.replicated).toContain('us');
    expect(result.failed).toContain('eu');
  });

  it('reads from the active region, falling back to a replica on miss/error', async () => {
    const us = fakeClient({ failGet: true });
    const eu = fakeClient();
    eu.store.set('k', JSON.stringify({ v: 'from-eu', ts: Date.now(), op: 'set' }));
    const replicator = new RegionReplicator(
      regions({ name: 'us', client: us }, { name: 'eu', client: eu }),
      'us'
    );

    expect(await replicator.get('k')).toBe('from-eu');
    expect(await replicator.get('missing')).toBeNull();
  });

  it('skips regions whose connection is dead', async () => {
    const us = fakeClient({ status: 'end' });
    const eu = fakeClient();
    const replicator = new RegionReplicator(
      regions({ name: 'us', client: us }, { name: 'eu', client: eu }),
      'us'
    );

    const result = await replicator.set('k', 'v');
    expect(result.origin).toBe('eu');
    expect(us.store.has('k')).toBe(false);
    expect(eu.store.get('k')).not.toBeNull();
  });

  it('deletes a key from every region', async () => {
    const us = fakeClient();
    const eu = fakeClient();
    us.store.set('k', JSON.stringify({ v: 'v', ts: Date.now(), op: 'set' }));
    eu.store.set('k', JSON.stringify({ v: 'v', ts: Date.now(), op: 'set' }));
    const replicator = new RegionReplicator(
      regions({ name: 'us', client: us }, { name: 'eu', client: eu }),
      'us'
    );

    const result = await replicator.del('k');
    expect(await replicator.get('k')).toBeNull();
    expect(result.deleted.sort()).toEqual(['eu', 'us']);
    expect(result.sequence).toBeGreaterThan(0);
  });

  it('does not return a value after a newer invalidation (stale write protection)', async () => {
    const us = fakeClient();
    const eu = fakeClient();
    const replicator = new RegionReplicator(
      regions({ name: 'us', client: us }, { name: 'eu', client: eu }),
      'us'
    );

    await replicator.set('k', 'v1');
    await replicator.del('k');
    await replicator.set('k', 'v2');

    expect(await replicator.get('k')).toBe('v2');
  });

  it('treats a late arriving stale write as a miss after invalidation', async () => {
    const us = fakeClient();
    const eu = fakeClient();
    const replicator = new RegionReplicator(
      regions({ name: 'us', client: us }, { name: 'eu', client: eu }),
      'us'
    );

    await replicator.set('k', 'v1');
    const delResult = await replicator.del('k');

    const stalePayload = JSON.stringify({ v: 'v1', ts: delResult.sequence - 1, op: 'set' });
    await us.set('k', stalePayload);

    expect(await replicator.get('k')).toBeNull();
  });

  it('survives region failures during invalidation and still returns misses', async () => {
    const us = fakeClient();
    const eu = fakeClient({ failSet: true });
    const replicator = new RegionReplicator(
      regions({ name: 'us', client: us }, { name: 'eu', client: eu }),
      'us'
    );

    await replicator.set('k', 'v');
    await replicator.del('k');

    expect(await replicator.get('k')).toBeNull();
  });

  it('handles legacy raw values as readable sets', async () => {
    const us = fakeClient();
    const replicator = new RegionReplicator(regions({ name: 'us', client: us }), 'us');

    us.store.set('legacy', 'raw-value');
    expect(await replicator.get('legacy')).toBe('raw-value');
  });
});
