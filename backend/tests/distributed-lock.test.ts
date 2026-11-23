import { describe, expect, it } from '@jest/globals';
import {
  DistributedLockManager,
  LockAcquisitionError,
  RedisLock,
  RedlockCoordinator,
  compileLockKey,
  type LockRedisClient,
} from '../src/lib/lock/index.js';
import {
  AtomicTransactionCoordinator,
  isRetryableTransactionError,
} from '../src/db/atomicTransactionCoordinator.js';
import { MIGRATION_LOCK_KEY, runWithMigrationLock } from '../src/db/migrationLock.js';

interface Entry {
  value: string;
  expiresAt: number | null;
}

/**
 * Deterministic in-memory Redis with a manually advanced clock so TTL /
 * expiry behaviour can be asserted without real timers.
 */
class FakeRedisServer {
  now = 0;
  private readonly store = new Map<string, Entry>();

  advance(ms: number): void {
    this.now += ms;
  }

  read(key: string): string | null {
    const entry = this.live(key);
    return entry ? entry.value : null;
  }

  write(key: string, value: string, ttlMs: number | null): void {
    this.store.set(key, { value, expiresAt: ttlMs === null ? null : this.now + ttlMs });
  }

  remove(key: string): boolean {
    return this.store.delete(key);
  }

  expire(key: string, ttlMs: number): boolean {
    const entry = this.live(key);
    if (!entry) {
      return false;
    }
    entry.expiresAt = this.now + ttlMs;
    return true;
  }

  size(): number {
    return this.store.size;
  }

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }
}

class FakeRedisClient implements LockRedisClient {
  constructor(private readonly server: FakeRedisServer) {}

  async set(key: string, value: string, ...args: Array<string | number>): Promise<unknown> {
    let nx = false;
    let ttlMs: number | null = null;
    for (let i = 0; i < args.length; i += 1) {
      const flag = String(args[i]).toUpperCase();
      if (flag === 'NX') {
        nx = true;
      }
      if (flag === 'PX') {
        ttlMs = Number(args[i + 1]);
      }
      if (flag === 'EX') {
        ttlMs = Number(args[i + 1]) * 1000;
      }
    }
    if (nx && this.server.read(key) !== null) {
      return null;
    }
    this.server.write(key, value, ttlMs);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.server.read(key);
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.server.remove(key)) {
        removed += 1;
      }
    }
    return removed;
  }

  async pexpire(key: string, ttlMs: number): Promise<number> {
    return this.server.expire(key, ttlMs) ? 1 : 0;
  }

  async eval(script: string, _numKeys: number, ...args: Array<string | number>): Promise<unknown> {
    const key = String(args[0]);
    const token = String(args[1]);
    if (this.server.read(key) !== token) {
      return 0;
    }
    if (script.includes('pexpire')) {
      this.server.expire(key, Number(args[2]));
      return 1;
    }
    if (script.includes('del')) {
      this.server.remove(key);
      return 1;
    }
    return 0;
  }
}

const createServer = (): FakeRedisServer => new FakeRedisServer();
const createClient = (server: FakeRedisServer): LockRedisClient => new FakeRedisClient(server);
const createManager = (server: FakeRedisServer): DistributedLockManager =>
  new DistributedLockManager({ clients: [createClient(server)] });

describe('RedisLock (#1419)', () => {
  it('grants the lock to a single holder until it is released', async () => {
    const server = createServer();
    const lock = new RedisLock(createClient(server));

    const first = await lock.tryAcquire('compile:proj', 1_000);
    expect(first).not.toBeNull();
    expect(await lock.tryAcquire('compile:proj', 1_000)).toBeNull();

    await first!.release();
    const second = await lock.tryAcquire('compile:proj', 1_000);
    expect(second).not.toBeNull();
    await second!.release();
  });

  it('only lets the owner release the lock', async () => {
    const server = createServer();
    const lock = new RedisLock(createClient(server));
    const handle = (await lock.tryAcquire('job', 1_000))!;

    expect(await lock.release(handle.key, 'not-the-owner')).toBe(false);
    expect(server.read(handle.key)).not.toBeNull();

    expect(await handle.release()).toBe(true);
    expect(server.read(handle.key)).toBeNull();
  });

  it('expires automatically once the TTL elapses', async () => {
    const server = createServer();
    const lock = new RedisLock(createClient(server));
    const handle = (await lock.tryAcquire('job', 1_000))!;

    expect(handle.isExpired()).toBe(false);
    expect(await lock.tryAcquire('job', 1_000)).toBeNull();

    server.advance(1_001);
    expect(server.read(handle.key)).toBeNull();
    expect(await lock.tryAcquire('job', 1_000)).not.toBeNull();
  });

  it('extends the TTL only for the owning token', async () => {
    const server = createServer();
    const lock = new RedisLock(createClient(server));
    const handle = (await lock.tryAcquire('job', 1_000))!;

    server.advance(900);
    expect(await handle.extend(5_000)).toBe(true);

    server.advance(2_000);
    expect(await lock.tryAcquire('job', 1_000)).toBeNull();

    server.advance(3_001);
    expect(await lock.tryAcquire('job', 1_000)).not.toBeNull();
  });

  it('runs a critical section and always releases the lock', async () => {
    const server = createServer();
    const lock = new RedisLock(createClient(server));

    const result = await lock.withLock(
      'job',
      { ttlMs: 1_000, retryCount: 0, autoExtend: false },
      async () => 'done',
    );

    expect(result).toBe('done');
    expect(server.size()).toBe(0);
  });

  it('throws LockAcquisitionError when the lock is contended', async () => {
    const server = createServer();
    const lock = new RedisLock(createClient(server));
    const held = (await lock.tryAcquire('job', 1_000))!;

    await expect(
      lock.withLock('job', { ttlMs: 1_000, retryCount: 0, autoExtend: false }, async () => 'nope'),
    ).rejects.toBeInstanceOf(LockAcquisitionError);

    await held.release();
  });
});

describe('RedlockCoordinator (#1419)', () => {
  const buildCluster = () => {
    const servers = [createServer(), createServer(), createServer()];
    const clients = servers.map((server) => createClient(server));
    return { servers, clients, coordinator: new RedlockCoordinator(clients) };
  };

  it('acquires when a majority quorum grants the lock', async () => {
    const { servers, clients, coordinator } = buildCluster();
    expect(coordinator.quorum).toBe(2);

    // One instance already holds a foreign lock, leaving two available.
    await clients[2]!.set('lock:compile:proj', 'foreign', 'PX', 10_000, 'NX');

    const handle = await coordinator.acquire('compile:proj', 1_000);
    expect(handle).not.toBeNull();

    await handle!.release();
    expect(servers[0]!.read('lock:compile:proj')).toBeNull();
    expect(servers[1]!.read('lock:compile:proj')).toBeNull();
    expect(servers[2]!.read('lock:compile:proj')).toBe('foreign');
  });

  it('fails and releases partial acquisitions when quorum is not reached', async () => {
    const { servers, clients, coordinator } = buildCluster();

    await clients[1]!.set('lock:job', 'foreign', 'PX', 10_000, 'NX');
    await clients[2]!.set('lock:job', 'foreign', 'PX', 10_000, 'NX');

    expect(await coordinator.acquire('job', 1_000)).toBeNull();
    // The single partial acquisition on instance 0 must be cleaned up.
    expect(servers[0]!.read('lock:job')).toBeNull();
  });

  it('releases every instance after a critical section', async () => {
    const { servers, coordinator } = buildCluster();

    const value = await coordinator.withLock(
      'job',
      { ttlMs: 1_000, retryCount: 0, autoExtend: false },
      async () => 42,
    );

    expect(value).toBe(42);
    for (const server of servers) {
      expect(server.read('lock:job')).toBeNull();
    }
  });
});

describe('DistributedLockManager (#1419)', () => {
  it('builds deterministic per-project compile keys', () => {
    const server = createServer();
    const manager = createManager(server);
    expect(compileLockKey('proj-1')).toBe('compile:proj-1');
    expect(manager.compileLockKey('proj-1')).toBe('compile:proj-1');
  });

  it('serializes compilations for the same project across nodes', async () => {
    const server = createServer();
    const nodeA = createManager(server);
    const nodeB = createManager(server);

    const held = await nodeA.acquire(nodeA.compileLockKey('proj-1'), 1_000);
    expect(held).not.toBeNull();

    await expect(
      nodeB.withCompileLock('proj-1', async () => 'b', { retryCount: 0, autoExtend: false }),
    ).rejects.toBeInstanceOf(LockAcquisitionError);

    await held!.release();
    await expect(
      nodeB.withCompileLock('proj-1', async () => 'b', { retryCount: 0, autoExtend: false }),
    ).resolves.toBe('b');
  });

  it('allows different projects to compile concurrently', async () => {
    const server = createServer();
    const nodeA = createManager(server);
    const nodeB = createManager(server);

    const held = await nodeA.acquire(nodeA.compileLockKey('proj-1'), 1_000);
    const other = await nodeB.withCompileLock('proj-2', async () => 'ok', {
      retryCount: 0,
      autoExtend: false,
    });

    expect(other).toBe('ok');
    await held!.release();
  });
});

describe('AtomicTransactionCoordinator (#1419)', () => {
  it('runs work inside a transaction while holding the resource lock', async () => {
    const server = createServer();
    const manager = createManager(server);
    const txToken = { tx: true };
    let runnerCalls = 0;
    const runner = async (work: (tx: any) => Promise<unknown>) => {
      runnerCalls += 1;
      return work(txToken);
    };
    const coordinator = new AtomicTransactionCoordinator({
      lockManager: manager,
      runner,
      retryDelayMs: 1,
    });

    const result = await coordinator.run('compile:proj', async (tx) => {
      expect(tx).toBe(txToken);
      return 'committed';
    });

    expect(result).toBe('committed');
    expect(runnerCalls).toBe(1);
    expect(server.read('lock:compile:proj')).toBeNull();
  });

  it('retries retryable serialization conflicts', async () => {
    const server = createServer();
    const manager = createManager(server);
    let attempts = 0;
    const runner = async (work: (tx: any) => Promise<unknown>) => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error('deadlock detected while executing transaction');
      }
      return work({});
    };
    const coordinator = new AtomicTransactionCoordinator({
      lockManager: manager,
      runner,
      maxRetries: 3,
      retryDelayMs: 1,
    });

    await expect(coordinator.run('compile:proj', async () => 'ok')).resolves.toBe('ok');
    expect(attempts).toBe(2);
    expect(server.read('lock:compile:proj')).toBeNull();
  });

  it('does not retry non-retryable errors and still releases the lock', async () => {
    const server = createServer();
    const manager = createManager(server);
    let attempts = 0;
    const runner = async () => {
      attempts += 1;
      throw new Error('syntax error');
    };
    const coordinator = new AtomicTransactionCoordinator({
      lockManager: manager,
      runner,
      maxRetries: 3,
      retryDelayMs: 1,
    });

    await expect(coordinator.run('compile:proj', async () => 'ok')).rejects.toThrow('syntax error');
    expect(attempts).toBe(1);
    expect(server.read('lock:compile:proj')).toBeNull();
  });

  it('classifies retryable transaction errors', () => {
    expect(isRetryableTransactionError(new Error('deadlock detected'))).toBe(true);
    expect(isRetryableTransactionError(new Error('could not serialize access'))).toBe(true);
    expect(isRetryableTransactionError(new Error('Prisma error P2034'))).toBe(true);
    expect(isRetryableTransactionError(new Error('invalid input syntax'))).toBe(false);
  });
});

describe('migration lock (#1419)', () => {
  it('prevents concurrent schema migrations', async () => {
    const server = createServer();
    const manager = createManager(server);
    const held = await manager.acquire(MIGRATION_LOCK_KEY, 1_000);
    expect(held).not.toBeNull();

    await expect(
      runWithMigrationLock(async () => 'migrated', {
        manager,
        retryCount: 0,
        autoExtend: false,
      }),
    ).rejects.toBeInstanceOf(LockAcquisitionError);

    await held!.release();
    await expect(
      runWithMigrationLock(async () => 'migrated', {
        manager,
        retryCount: 0,
        autoExtend: false,
      }),
    ).resolves.toBe('migrated');
  });
});
