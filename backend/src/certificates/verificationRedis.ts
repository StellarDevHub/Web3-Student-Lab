import { REDIS_MODE, redisClusterConfig, redisConfig } from '../config/redis.config.js';
import Ioredis, { Cluster } from 'ioredis';

/**
 * Cluster-aware certificate verification keys (#1142).
 *
 * Certificate verification is scaled horizontally by sharding verification
 * keys across a Redis Cluster (3 master + 3 replica). Two properties make
 * this safe:
 *
 *  - **Hash tags** — every verification key uses an explicit hash tag
 *    `{cert:<id>}` so all keys for one certificate land on the same slot.
 *    Cross-slot multi-key commands (mget/del on the same certificate) are
 *    therefore atomic without cluster-wide transactions.
 *  - **MOVED/ASK redirects** — the ioredis Cluster client follows redirects
 *    automatically and re-pools connections per slot, so a node failover
 *    promotes a replica with zero client-side changes.
 */

/** Build a hash-tagged verification key for a certificate ID. */
export function verificationKey(certificateId: string): string {
  return `{cert:${certificateId}}:verification`;
}

/** Build a hash-tagged revocation status key. */
export function revocationKey(certificateId: string): string {
  return `{cert:${certificateId}}:revoked`;
}

/** Build a hash-tagged rate/attempt counter key. */
export function verificationAttemptsKey(certificateId: string, windowSec = 60): string {
  return `{cert:${certificateId}}:attempts:${Math.floor(Date.now() / (windowSec * 1000))}`;
}

/**
 * Cluster-aware client for verification lookups. Picks the standalone or
 * cluster client based on REDIS_MODE; `MOVED`/`ASK` redirects are handled by
 * ioredis' Cluster pipeline internally.
 */
export class VerificationRedisClient {
  private client: Ioredis | Cluster;

  constructor() {
    if (REDIS_MODE === 'cluster') {
      this.client = new Cluster(redisClusterConfig.nodes, {
        ...redisClusterConfig.options,
        // Explicit hash tags mean every key for one certificate is on one
        // slot; enable cluster pipelines so bulk reads are batched per slot.
        enableClusterPipeline: true,
      } as any);
    } else {
      this.client = new Ioredis(redisConfig as any);
    }
  }

  /** Write a verification result under the hash-tagged key. */
  async setVerification(certificateId: string, result: string): Promise<void> {
    await this.client.set(verificationKey(certificateId), result);
  }

  /** Read a cached verification result. */
  async getVerification(certificateId: string): Promise<string | null> {
    return this.client.get(verificationKey(certificateId));
  }

  /** Revocation status for a certificate. */
  async isRevoked(certificateId: string): Promise<boolean> {
    return (await this.client.get(revocationKey(certificateId))) === '1';
  }

  /**
   * Increment the attempt counter and return the new count. The key is
   * hash-tagged so the INCR+EXPIRE pair operates on a single slot.
   */
  async incrementAttempt(certificateId: string, ttlSec = 60): Promise<number> {
    const key = verificationAttemptsKey(certificateId, ttlSec);
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, ttlSec);
    }
    return count;
  }

  /** Multi-key read for one certificate (same slot — safe under cluster). */
  async getCertificateState(certificateId: string): Promise<{
    verification: string | null;
    revoked: boolean;
  }> {
    const [verification, revoked] = await this.client.mget(
      verificationKey(certificateId),
      revocationKey(certificateId),
    );
    return {
      verification,
      revoked: revoked === '1',
    };
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

export const verificationRedisClient = new VerificationRedisClient();