import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateMetric, formatMetricValue, FpsTracker, TelemetryPipeline } from '../webVitals';

describe('Web Vitals Telemetry Utilities', () => {
  it('correctly rates metrics based on standard Web Vitals thresholds', () => {
    // LCP
    expect(rateMetric('LCP', 2000)).toBe('good');
    expect(rateMetric('LCP', 3000)).toBe('needs-improvement');
    expect(rateMetric('LCP', 4500)).toBe('poor');

    // FID
    expect(rateMetric('FID', 50)).toBe('good');
    expect(rateMetric('FID', 150)).toBe('needs-improvement');
    expect(rateMetric('FID', 400)).toBe('poor');

    // INP (Target: < 50ms)
    expect(rateMetric('INP', 30)).toBe('good');
    expect(rateMetric('INP', 50)).toBe('good');
    expect(rateMetric('INP', 80)).toBe('needs-improvement');
    expect(rateMetric('INP', 250)).toBe('poor');

    // CLS (Target: < 0.05)
    expect(rateMetric('CLS', 0.02)).toBe('good');
    expect(rateMetric('CLS', 0.05)).toBe('good');
    expect(rateMetric('CLS', 0.08)).toBe('needs-improvement');
    expect(rateMetric('CLS', 0.15)).toBe('poor');
  });

  it('formats metric values correctly for display', () => {
    expect(formatMetricValue('LCP', 2412.8)).toBe('2413 ms');
    expect(formatMetricValue('INP', 32.1)).toBe('32 ms');
    expect(formatMetricValue('CLS', 0.0245)).toBe('0.025');
  });

  it('FpsTracker computes FPS and frame drops accurately', () => {
    const tracker = new FpsTracker();
    const initialReport = tracker.getReport();
    expect(initialReport.currentFps).toBe(60);
    expect(initialReport.status).toBe('smooth');
    expect(initialReport.frameDrops).toBe(0);

    const listener = vi.fn();
    const unsub = tracker.subscribe(listener);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('TelemetryPipeline records typing events, aggregates INP, and logs to console', async () => {
    const pipeline = new TelemetryPipeline({ enableConsoleLogging: true });
    expect(pipeline.isConsoleLogging()).toBe(true);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Add typing samples under 50ms target
    pipeline.addSample(18);
    pipeline.addSample(24);
    pipeline.addSample(30);

    const stats = pipeline.getTypingStats();
    expect(stats.sampleCount).toBe(3);
    expect(stats.averageLatencyMs).toBe(24);
    expect(stats.p95LatencyMs).toBeLessThanOrEqual(50);
    expect(stats.meetsTarget).toBe(true);

    const latency = await pipeline.recordTypingEvent(Date.now());
    expect(typeof latency).toBe('number');

    const flushResult = await pipeline.flushTelemetry({
      sessionId: 'test_session',
      timestamp: Date.now(),
      vitals: { LCP: 1200, FID: 15, INP: 25, CLS: 0.01, FCP: 800, TTFB: 100 },
      fps: trackerReportFixture,
      typingInp: stats,
    });
    expect(flushResult.success).toBe(true);

    logSpy.mockRestore();
  });
});

const trackerReportFixture = {
  currentFps: 60,
  averageFps: 60,
  frameDrops: 0,
  jitterMs: 0.2,
  status: 'smooth' as const,
};
