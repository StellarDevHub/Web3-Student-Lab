/**
 * Redis Cluster Slot Sharding for Scalable Certificate Verification (#1142).
 *
 * Provides a Redis Cluster client configuration optimized for the certificate
 * verification workload. Certificate data is sharded by hash slot to distribute
 * load across cluster nodes, with read replicas for verification queries.
 *
 * Usage:
 *   import { createClusterClient, getCertificateSlot } from '../utils/redis-cluster';
 *
 *   const cluster = createClusterClient();
 *   const slot = getCertificateSlot(certId);
 *   await cluster.set(`cert:${certId}`, JSON.stringify(certData));
 */

import Redis from 'ioredis';

export interface RedisClusterConfig {
  /** Comma-separated list of cluster nodes (host:port). */
  nodes: string[];
  /** Password for all cluster nodes. */
  password?: string;
  /** Maximum retries per request. */
  maxRetriesPerRequest?: number;
  /** Time to wait between retries (ms). */
  retryDelayOnFailover?: number;
  /** Enable read from replicas for GET operations. */
  enableReadyCheck?: boolean;
  /** Natural key for consistent slot routing. */
  scaleReads?: 'slave' | 'master' | 'all';
}

const DEFAULT_CONFIG: Partial<RedisClusterConfig> = {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 200,
  enableReadyCheck: true,
  scaleReads: 'slave',
};

/**
 * Create a Redis Cluster client for certificate verification.
 */
export function createClusterClient(
  config?: Partial<RedisClusterConfig>,
): Redis.Cluster {
  const nodes = (config?.nodes || process.env.REDIS_CLUSTER_NODES || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => {
      const [host, port] = n.split(':');
      return { host: host || '127.0.0.1', port: Number(port) || 6379 };
    });

  if (nodes.length === 0) {
    throw new Error(
      'Redis Cluster nodes not configured. Set REDIS_CLUSTER_NODES env var (host:port,host:port,...)',
    );
  }

  return new Redis.Cluster(nodes, {
    redisOptions: {
      password: config?.password || process.env.REDIS_CLUSTER_PASSWORD,
      maxRetriesPerRequest: config?.maxRetriesPerRequest ?? DEFAULT_CONFIG.maxRetriesPerRequest,
    },
    scaleReads: config?.scaleReads ?? DEFAULT_CONFIG.scaleReads,
    enableReadyCheck: config?.enableReadyCheck ?? DEFAULT_CONFIG.enableReadyCheck,
    clusterRetryStrategy: (times: number) => {
      if (times > 3) return null; // Stop retrying after 3 attempts
      return Math.min(times * 100, 2000);
    },
  });
}

/**
 * Get the Redis hash slot for a certificate ID.
 * Used for consistent routing in cluster mode.
 */
export function getCertificateSlot(certId: string): number {
  // CRC16 is the standard Redis cluster hash function
  return crc16(certId) % 16384;
}

/**
 * CRC16 implementation (CCITT variant) matching Redis cluster.
 */
function crc16(str: string): number {
  let crc = 0;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xffff;
    }
  }
  return crc;
}

/**
 * Certificate verification cache operations for cluster mode.
 */
export class CertificateClusterStore {
  private cluster: Redis.Cluster;

  constructor(cluster: Redis.Cluster) {
    this.cluster = cluster;
  }

  /**
   * Store certificate verification result.
   */
  async setVerificationResult(
    certId: string,
    result: { verified: boolean; batchId: number; timestamp: number },
  ): Promise<void> {
    const key = `cert:verify:${certId}`;
    await this.cluster.set(key, JSON.stringify(result), 'EX', 86400); // 24h TTL
  }

  /**
   * Get cached verification result.
   */
  async getVerificationResult(
    certId: string,
  ): Promise<{ verified: boolean; batchId: number; timestamp: number } | null> {
    const raw = await this.cluster.get(`cert:verify:${certId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Store batch verification results (for bulk verification).
   */
  async setBatchResults(
    batchId: string,
    results: Map<string, boolean>,
  ): Promise<void> {
    const pipeline = this.cluster.pipeline();
    for (const [certId, verified] of results) {
      pipeline.set(
        `cert:batch:${batchId}:${certId}`,
        JSON.stringify(verified),
        'EX',
        86400,
      );
    }
    await pipeline.exec();
  }

  /**
   * Invalidate all cached results for a batch (e.g., after re-anchoring).
   */
  async invalidateBatch(batchId: string): Promise<void> {
    const pattern = `cert:batch:${batchId}:*`;
    const keys = await this.cluster.keys(pattern);
    if (keys.length > 0) {
      await this.cluster.del(...keys);
    }
  }
}
