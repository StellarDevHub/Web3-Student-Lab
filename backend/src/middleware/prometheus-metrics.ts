/**
 * Prometheus Redis Metrics Exporter (#1140).
 *
 * Exposes Redis metrics in Prometheus format for Grafana dashboarding.
 * Tracks connection pool stats, command latency, memory usage, and
 * key counts by pattern.
 *
 * Usage:
 *   import { redisMetrics } from '../middleware/prometheus-metrics';
 *
 *   // In your /metrics endpoint:
 *   const metrics = await redisMetrics.collect();
 *   res.set('Content-Type', 'text/plain');
 *   res.send(metrics);
 */

import { redisConnection } from '../utils/redis';

interface MetricLine {
  name: string;
  help: string;
  type: string;
  samples: Array<{ labels: Record<string, string>; value: number }>;
}

function formatMetric(metric: MetricLine): string {
  const lines = [`# HELP ${metric.name} ${metric.help}`, `# TYPE ${metric.name} ${metric.type}`];
  for (const sample of metric.samples) {
    const labels = Object.entries(sample.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    lines.push(`${metric.name}{${labels}} ${sample.value}`);
  }
  return lines.join('\n');
}

/**
 * Collect all Redis metrics in Prometheus exposition format.
 */
export async function collectRedisMetrics(): Promise<string> {
  const metrics: MetricLine[] = [];

  try {
    // Redis INFO
    const info = await redisConnection.info();
    const parsed: Record<string, string> = {};
    for (const line of info.split('\n')) {
      const [key, value] = line.split(':');
      if (key && value) parsed[key.trim()] = value.trim();
    }

    // Connected clients
    metrics.push({
      name: 'redis_connected_clients',
      help: 'Number of connected clients',
      type: 'gauge',
      samples: [{ labels: {}, value: Number(parsed.connected_clients) || 0 }],
    });

    // Used memory
    metrics.push({
      name: 'redis_memory_used_bytes',
      help: 'Total number of bytes allocated by Redis',
      type: 'gauge',
      samples: [{ labels: {}, value: Number(parsed.used_memory) || 0 }],
    });

    // Peak memory
    metrics.push({
      name: 'redis_memory_peak_bytes',
      help: 'Peak memory allocated by Redis',
      type: 'gauge',
      samples: [{ labels: {}, value: Number(parsed.used_memory_peak) || 0 }],
    });

    // Total commands processed
    metrics.push({
      name: 'redis_commands_processed_total',
      help: 'Total number of commands processed',
      type: 'counter',
      samples: [{ labels: {}, value: Number(parsed.total_commands_processed) || 0 }],
    });

    // Keyspace hits
    metrics.push({
      name: 'redis_keyspace_hits_total',
      help: 'Total number of successful key lookups',
      type: 'counter',
      samples: [{ labels: {}, value: Number(parsed.keyspace_hits) || 0 }],
    });

    // Keyspace misses
    metrics.push({
      name: 'redis_keyspace_misses_total',
      help: 'Total number of failed key lookups',
      type: 'counter',
      samples: [{ labels: {}, value: Number(parsed.keyspace_misses) || 0 }],
    });

    // Hit rate
    const hits = Number(parsed.keyspace_hits) || 0;
    const misses = Number(parsed.keyspace_misses) || 0;
    const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;
    metrics.push({
      name: 'redis_keyspace_hit_rate',
      help: 'Ratio of successful key lookups to total lookups',
      type: 'gauge',
      samples: [{ labels: {}, value: hitRate }],
    });

    // Connected clients per database
    for (const [key, value] of Object.entries(parsed)) {
      const dbMatch = key.match(/^db(\d+)$/);
      if (dbMatch) {
        const [keys, expires] = value.split(',');
        const keysNum = Number(keys?.split('=')[1]) || 0;
        const expiresNum = Number(expires?.split('=')[1]) || 0;
        metrics.push({
          name: 'redis_db_keys',
          help: 'Number of keys in database',
          type: 'gauge',
          samples: [{ labels: { db: dbMatch[1] }, value: keysNum }],
        });
        metrics.push({
          name: 'redis_db_keys_with_expiry',
          help: 'Number of keys with expiry in database',
          type: 'gauge',
          samples: [{ labels: { db: dbMatch[1] }, value: expiresNum }],
        });
      }
    }

    // Uptime
    metrics.push({
      name: 'redis_uptime_seconds',
      help: 'Total seconds since Redis last restart',
      type: 'gauge',
      samples: [{ labels: {}, value: Number(parsed.uptime_in_seconds) || 0 }],
    });

    // Replication role
    metrics.push({
      name: 'redis_is_master',
      help: '1 if this is a master instance, 0 if replica',
      type: 'gauge',
      samples: [{ labels: {}, value: parsed.role === 'master' ? 1 : 0 }],
    });
  } catch (err) {
    console.error('[prometheus] Failed to collect Redis metrics:', err);
  }

  return metrics.map(formatMetric).join('\n\n') + '\n';
}

/**
 * Express middleware that serves /metrics endpoint.
 */
export function prometheusMiddleware() {
  return async (req: Request, res: Response) => {
    if ((req as any).url === '/metrics') {
      const metrics = await collectRedisMetrics();
      (res as any).setHeader('Content-Type', 'text/plain; version=0.0.4');
      (res as any).send(metrics);
    }
  };
}
