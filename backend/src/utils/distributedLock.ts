/**
 * Cross-pod distributed locking via Redlock (BE-004).
 *
 * Horizontally scaled backend pods coordinate through a quorum of independent
 * Redis primaries configured with `REDLOCK_NODES` (host:port,host:port,...).
 * A lock is held only when a majority of nodes granted it within the TTL minus
 * clock drift, so a single crashed or partitioned node — including a Sentinel
 * master mid-failover — cannot hand the same lock to two pods.
 *
 * When `REDLOCK_NODES` is unset the shared connection is used as a single lock
 * node, which keeps local development and tests working unchanged.
 *
 * Usage:
 *   import { withDistributedLock } from '../utils/distributedLock.js';
 *
 *   await withDistributedLock(`cert:mint:${studentId}`, async () => {
 *     await mintCertificate(studentId);
 *   });
 */

import { Redis } from 'ioredis';
import { redlockConfig } from '../config/redis.config.js';
import { DistributedLockManager } from '../lib/lock/DistributedLockManager.js';
import type { LockHandle, LockOptions, LockRedisClient } from '../lib/lock/types.js';
import logger from './logger.js';

export { LockAcquisitionError } from '../lib/lock/RedisLock.js';

export interface RedlockNode {
  host: string;
  port: number;
}

/** Open one fail-fast connection per independent Redlock node. */
export function createRedlockClients(
  nodes: RedlockNode[] = redlockConfig.nodes,
  password: string | undefined = redlockConfig.password
): Redis[] {
  return nodes.map(({ host, port }) => {
    const client = new Redis({ host, port, password, ...redlockConfig.nodeOptions });
    client.on('error', (err: Error) => {
      // A down node only reduces the quorum margin; it must not crash the pod.
      logger.warn(`Redlock node ${host}:${port} error: ${err.message}`);
    });
    return client;
  });
}

/**
 * Build the lock manager. With fewer than three nodes Redlock cannot tolerate
 * a node failure, so that configuration is logged as a warning.
 */
export function createDistributedLockManager(clients?: LockRedisClient[]): DistributedLockManager {
  const lockClients = clients ?? (createRedlockClients() as unknown as LockRedisClient[]);

  if (lockClients.length === 0) {
    return new DistributedLockManager();
  }
  if (lockClients.length < 3) {
    logger.warn(
      `Redlock configured with ${lockClients.length} node(s); at least 3 independent nodes are needed to survive a node failure`
    );
  }
  return new DistributedLockManager({
    clients: lockClients,
    clockDriftFactor: redlockConfig.clockDriftFactor,
  });
}

let manager: DistributedLockManager | null = null;

/** Lazily constructed process-wide lock manager. */
export function getDistributedLockManager(): DistributedLockManager {
  if (!manager) {
    manager = createDistributedLockManager(process.env.NODE_ENV === 'test' ? [] : undefined);
  }
  return manager;
}

/** Replace the process-wide manager (tests). */
export function setDistributedLockManager(next: DistributedLockManager | null): void {
  manager = next;
}

/**
 * Run `fn` while holding `key` across every pod. The lock is auto-extended for
 * long-running work and always released, even when `fn` throws. Throws
 * {@link LockAcquisitionError} when the quorum cannot be reached.
 */
export function withDistributedLock<T>(
  key: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  return getDistributedLockManager().withLock(key, { autoExtend: true, ...options }, fn);
}

/** Non-blocking acquisition; returns `null` when another pod holds the lock. */
export function tryAcquireDistributedLock(key: string, ttlMs?: number): Promise<LockHandle | null> {
  return getDistributedLockManager().acquire(key, ttlMs);
}
