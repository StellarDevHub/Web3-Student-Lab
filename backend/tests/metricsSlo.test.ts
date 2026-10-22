/**
 * SLO metric exposure: request-duration histogram (for p95 alerts), dependency
 * probe counters (for the RPC failure-rate alert) and DB pool utilisation
 * (for the pool alert). These feed monitoring/prometheus/alert.rules.yml.
 */

import metricsCollector, { DURATION_BUCKETS_MS } from '../src/metrics/MetricsCollector.js';
import { renderPrometheus } from '../src/metrics/MetricsExporter.js';
import {
  getDbPoolUtilizationPct,
  resetDbPoolUtilizationPct,
  setDbPoolUtilizationPct,
} from '../src/metrics/dbPoolMetrics.js';

describe('request duration histogram', () => {
  beforeEach(() => {
    metricsCollector.reset();
  });

  it('counts requests cumulatively per bucket upper bound', () => {
    metricsCollector.recordRequest('GET', '/a', 40, 200); // <= 50
    metricsCollector.recordRequest('GET', '/a', 600, 200); // <= 1000
    metricsCollector.recordRequest('GET', '/a', 1600, 200); // <= 2500

    const h = metricsCollector.getDurationHistogram();
    const byLe = Object.fromEntries(h.buckets.map((b) => [b.le, b.count]));

    expect(h.count).toBe(3);
    expect(h.sumMs).toBe(2240);
    expect(byLe[50]).toBe(1);
    expect(byLe[500]).toBe(1);
    expect(byLe[1000]).toBe(2);
    expect(byLe[1500]).toBe(2);
    expect(byLe[2500]).toBe(3);
    expect(h.buckets.map((b) => b.le)).toEqual([...DURATION_BUCKETS_MS]);
  });

  it('keeps the 1500 ms SLO threshold as an exact bucket boundary', () => {
    expect(DURATION_BUCKETS_MS).toContain(1500);
  });

  it('renders histogram lines with +Inf, _sum and _count', () => {
    metricsCollector.recordRequest('GET', '/a', 120, 200);

    const text = renderPrometheus();

    expect(text).toContain('# TYPE w3sl_http_request_duration_milliseconds histogram');
    expect(text).toContain('w3sl_http_request_duration_milliseconds_bucket{le="250"} 1');
    expect(text).toContain('w3sl_http_request_duration_milliseconds_bucket{le="+Inf"} 1');
    expect(text).toContain('w3sl_http_request_duration_milliseconds_sum 120');
    expect(text).toContain('w3sl_http_request_duration_milliseconds_count 1');
  });

  it('is cleared by reset()', () => {
    metricsCollector.recordRequest('GET', '/a', 10, 200);
    metricsCollector.reset();
    expect(metricsCollector.getDurationHistogram().count).toBe(0);
  });
});

describe('dependency probe counters', () => {
  beforeEach(() => {
    metricsCollector.reset();
  });

  it('counts ok and failed probe outcomes per probe', () => {
    metricsCollector.recordProbe('horizon_ledger', true);
    metricsCollector.recordProbe('horizon_ledger', true);
    metricsCollector.recordProbe('horizon_ledger', false);

    expect(metricsCollector.getProbeCounts()).toEqual({
      horizon_ledger: { ok: 2, failed: 1 },
    });

    const text = renderPrometheus();
    expect(text).toContain('w3sl_external_probe_total{probe="horizon_ledger",outcome="ok"} 2');
    expect(text).toContain('w3sl_external_probe_total{probe="horizon_ledger",outcome="failed"} 1');
  });
});

describe('DB pool utilisation gauge', () => {
  afterEach(() => {
    resetDbPoolUtilizationPct();
  });

  it('is omitted until a health check has recorded a value', () => {
    expect(getDbPoolUtilizationPct()).toBeNull();
    expect(renderPrometheus()).not.toContain('w3sl_db_pool_utilization_percent');
  });

  it('renders the last recorded utilisation and clamps to 0-100', () => {
    setDbPoolUtilizationPct(87);
    expect(renderPrometheus()).toContain('w3sl_db_pool_utilization_percent 87');

    setDbPoolUtilizationPct(250);
    expect(getDbPoolUtilizationPct()).toBe(100);

    setDbPoolUtilizationPct(Number.NaN);
    expect(getDbPoolUtilizationPct()).toBe(100);
  });
});
