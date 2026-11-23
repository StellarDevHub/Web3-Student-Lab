import {
  acquireMigrationLock,
  MigrationLockClient,
  MigrationLockTimeoutError,
  withMigrationLock,
} from '../src/db/migrationLock.js';

class FakeRedis implements MigrationLockClient {
  private store = new Map<string, { value: string; expiresAt: number }>();
  now = 0;

  async set(
    key: string,
    value: string,
    _expiryMode: 'PX',
    ttlMs: number,
    _setMode: 'NX'
  ): Promise<'OK' | null> {
    const current = this.store.get(key);
    if (current && current.expiresAt > this.now) return null;
    this.store.set(key, { value, expiresAt: this.now + ttlMs });
    return 'OK';
  }

  async eval(script: string, _numKeys: number, ...args: Array<string | number>): Promise<unknown> {
    const key = String(args[0]);
    const token = String(args[1]);
    const current = this.store.get(key);
    if (!current || current.value !== token || current.expiresAt <= this.now) return 0;
    if (script.includes('del')) {
      this.store.delete(key);
      return 1;
    }
    current.expiresAt = this.now + Number(args[2]);
    return 1;
  }
}

describe('migration lock', () => {
  it('runs overlapping containers one after another without deadlock', async () => {
    const redis = new FakeRedis();
    const order: string[] = [];

    const run = (name: string) =>
      withMigrationLock(
        redis,
        async () => {
          order.push(`${name}:start`);
          await new Promise((resolve) => setTimeout(resolve, 30));
          order.push(`${name}:end`);
        },
        { retryMs: 5, ttlMs: 5_000, waitTimeoutMs: 2_000, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) }
      );

    await Promise.all([run('a'), run('b'), run('c')]);

    const starts = order.filter((e) => e.endsWith(':start'));
    const ends = order.filter((e) => e.endsWith(':end'));
    expect(starts).toHaveLength(3);
    expect(ends).toHaveLength(3);
    for (let i = 0; i < order.length; i += 2) {
      const holder = order[i].split(':')[0];
      expect(order[i + 1]).toBe(`${holder}:end`);
    }
  });

  it('fails the waiter when the lock is never released instead of hanging', async () => {
    const redis = new FakeRedis();
    await acquireMigrationLock(redis, { token: 'holder', ttlMs: 60_000, waitTimeoutMs: 50, retryMs: 5 });

    await expect(
      acquireMigrationLock(redis, {
        token: 'waiter',
        ttlMs: 60_000,
        waitTimeoutMs: 40,
        retryMs: 5,
        now: () => Date.now(),
      })
    ).rejects.toBeInstanceOf(MigrationLockTimeoutError);
  });

  it('lets a waiter proceed after the holder TTL expires', async () => {
    const redis = new FakeRedis();
    redis.now = 1_000;
    await acquireMigrationLock(redis, {
      token: 'holder',
      ttlMs: 100,
      now: () => redis.now,
      sleep: async () => undefined,
    });
    redis.now = 1_200;
    const second = await acquireMigrationLock(redis, {
      token: 'waiter',
      ttlMs: 100,
      now: () => redis.now,
      sleep: async () => undefined,
      waitTimeoutMs: 50,
    });
    expect(second.token).toBe('waiter');
  });
});
