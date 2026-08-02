import prisma from '../db/index.js';
import logger from '../utils/logger.js';

export interface DbHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  poolUsage: {
    active: number;
    idle: number;
    total: number;
    utilizationPct: number;
  };
  alerts: string[];
  checkedAt: string;
}

// Thresholds for alerting
const LATENCY_WARN_MS = 500;
const LATENCY_CRITICAL_MS = 2000;
const POOL_WARN_PCT = 80;

/**
 * Checks database connection health by running a lightweight query
 * and reporting pool utilization metrics.
 *
 * Pool stats are approximated from environment config since Prisma does
 * not expose live pool counters directly.
 */
export async function checkDbHealth(): Promise<DbHealthStatus> {
  const alerts: string[] = [];
  const start = Date.now();

  try {
    // Lightweight connectivity probe — avoids full table scans
    await (prisma as any).$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;

    const poolMax = Math.max(parseInt(process.env.DB_POOL_MAX || '20', 10), 1);

    let activeConnections = 0;
    try {
      const rows = await (prisma as any).$queryRawUnsafe(
        `SELECT count(*) AS active
         FROM pg_stat_activity
         WHERE datname = current_database()
         AND state = 'active'`
      );
      activeConnections = Number(rows?.[0]?.active ?? 0);
    } catch (statError) {
      logger.warn('DB pool activity query failed', statError);
    }

    const active = Number.isFinite(activeConnections) ? activeConnections : 0;
    const idle = Math.max(poolMax - active, 0);
    const utilizationPct = poolMax > 0 ? Math.min(100, Math.round((active / poolMax) * 100)) : 0;

    const poolUsage = {
      active,
      idle,
      total: poolMax,
      utilizationPct,
    };

    if (latencyMs > LATENCY_CRITICAL_MS) {
      alerts.push(`Critical: DB query latency ${latencyMs}ms exceeds ${LATENCY_CRITICAL_MS}ms`);
    } else if (latencyMs > LATENCY_WARN_MS) {
      alerts.push(`Warning: DB query latency ${latencyMs}ms exceeds ${LATENCY_WARN_MS}ms`);
    }

    if (utilizationPct >= POOL_WARN_PCT) {
      alerts.push(
        `Warning: DB connection utilization is ${utilizationPct}% of configured pool max (${poolMax})`
      );
    }

    if (active > poolMax) {
      alerts.push(
        `Critical: Active DB connections ${active} exceed configured pool max ${poolMax}`
      );
    }

    const status: DbHealthStatus['status'] =
      latencyMs > LATENCY_CRITICAL_MS || active > poolMax ? 'degraded' : 'healthy';

    if (alerts.length > 0) {
      logger.warn('DB health alerts', { alerts, latencyMs, poolUsage });
    }

    return {
      status,
      latencyMs,
      poolUsage,
      alerts,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const message = error instanceof Error ? error.message : 'Unknown DB error';
    logger.error('DB health check failed', { error: message });

    return {
      status: 'unhealthy',
      latencyMs,
      poolUsage: { active: 0, idle: 0, total: 0, utilizationPct: 0 },
      alerts: [`DB connection failed: ${message}`],
      checkedAt: new Date().toISOString(),
    };
  }
}
