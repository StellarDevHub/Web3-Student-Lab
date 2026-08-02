/**
 * Unit tests for MetricsCollector and metrics routes.
 *
 * Coverage targets:
 *   - MetricsCollector: recordRequest, recordError, recordEvent, getSummary,
 *     getPerformanceMetrics, getErrorMetrics, getBusinessMetrics, reset,
 *     ring-buffer trimming, slow-request warning
 *   - metrics.routes: GET /, GET /performance, GET /errors, GET /business,
 *     POST /reset
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MetricsCollector } from '../src/metrics/MetricsCollector.js';

jest.mock('../src/utils/logger.js', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    auditLogger: { info: jest.fn() },
  };
});

import mockLoggerImport from '../src/utils/logger.js';
const mockLogger = mockLoggerImport as unknown as { info: jest.Mock, warn: jest.Mock, error: jest.Mock };

// ─── MetricsCollector unit tests ─────────────────────────────────────────────

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    // Fresh instance for each test — avoids cross-test pollution.
    collector = new MetricsCollector();
  });

  // ── recordRequest ────────────────────────────────────────────────────────────

  describe('recordRequest', () => {
    it('stores a performance metric entry', () => {
      collector.recordRequest('GET', '/api/v1/courses', 120, 200);
      const metrics = collector.getPerformanceMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].method).toBe('GET');
      expect(metrics[0].route).toBe('/api/v1/courses');
      expect(metrics[0].durationMs).toBe(120);
      expect(metrics[0].statusCode).toBe(200);
    });

    it('sets a valid ISO timestamp', () => {
      collector.recordRequest('POST', '/api/v1/auth', 50, 201);
      const ts = collector.getPerformanceMetrics()[0].timestamp;
      expect(new Date(ts).toISOString()).toBe(ts);
    });

    it('accumulates multiple requests', () => {
      collector.recordRequest('GET', '/a', 10, 200);
      collector.recordRequest('GET', '/b', 20, 200);
      collector.recordRequest('DELETE', '/c', 30, 204);
      expect(collector.getPerformanceMetrics()).toHaveLength(3);
    });

    it('logs a warning for slow requests (>1000 ms)', () => {
      // Verify the slow-request path doesn't throw and still records the metric.
      expect(() => collector.recordRequest('GET', '/slow', 1500, 200)).not.toThrow();
      expect(collector.getPerformanceMetrics()[0].durationMs).toBe(1500);
    });

    it('does NOT warn for fast requests', () => {
      mockLogger.warn.mockClear();
      collector.recordRequest('GET', '/fast', 200, 200);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  // ── recordError ──────────────────────────────────────────────────────────────

  describe('recordError', () => {
    it('stores an error metric entry', () => {
      collector.recordError('ValidationError', 'Invalid email', 400);
      const errors = collector.getErrorMetrics();
      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe('ValidationError');
      expect(errors[0].message).toBe('Invalid email');
      expect(errors[0].statusCode).toBe(400);
    });

    it('works without a statusCode', () => {
      collector.recordError('UnhandledRejection', 'Promise rejected');
      const errors = collector.getErrorMetrics();
      expect(errors[0].statusCode).toBeUndefined();
    });

    it('sets a valid ISO timestamp', () => {
      collector.recordError('TypeError', 'Cannot read property');
      const ts = collector.getErrorMetrics()[0].timestamp;
      expect(new Date(ts).toISOString()).toBe(ts);
    });

    it('records the error without throwing', () => {
      expect(() => collector.recordError('DBError', 'Connection refused')).not.toThrow();
      expect(collector.getErrorMetrics()[0].type).toBe('DBError');
    });
  });

  // ── recordEvent ──────────────────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('stores a business metric entry', () => {
      collector.recordEvent('user.registered', { plan: 'free' });
      const events = collector.getBusinessMetrics();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('user.registered');
      expect(events[0].metadata).toEqual({ plan: 'free' });
    });

    it('works without metadata', () => {
      collector.recordEvent('certificate.issued');
      const events = collector.getBusinessMetrics();
      expect(events[0].metadata).toBeUndefined();
    });

    it('sets a valid ISO timestamp', () => {
      collector.recordEvent('course.enrolled');
      const ts = collector.getBusinessMetrics()[0].timestamp;
      expect(new Date(ts).toISOString()).toBe(ts);
    });

    it('records the event without throwing', () => {
      expect(() => collector.recordEvent('user.registered')).not.toThrow();
      expect(collector.getBusinessMetrics()[0].event).toBe('user.registered');
    });
  });

  // ── getSummary ───────────────────────────────────────────────────────────────

  describe('getSummary', () => {
    it('returns zero counts when no metrics recorded', () => {
      const summary = collector.getSummary();
      expect(summary.performance.totalRequests).toBe(0);
      expect(summary.performance.averageDurationMs).toBe(0);
      expect(summary.errors.totalErrors).toBe(0);
      expect(summary.business.totalEvents).toBe(0);
    });

    it('aggregates request counts by route', () => {
      collector.recordRequest('GET', '/courses', 100, 200);
      collector.recordRequest('GET', '/courses', 200, 200);
      collector.recordRequest('POST', '/courses', 150, 201);
      const { requestsByRoute } = collector.getSummary().performance;
      expect(requestsByRoute['GET /courses']).toBe(2);
      expect(requestsByRoute['POST /courses']).toBe(1);
    });

    it('aggregates request counts by status code', () => {
      collector.recordRequest('GET', '/a', 50, 200);
      collector.recordRequest('GET', '/b', 50, 200);
      collector.recordRequest('GET', '/c', 50, 404);
      const { requestsByStatus } = collector.getSummary().performance;
      expect(requestsByStatus['200']).toBe(2);
      expect(requestsByStatus['404']).toBe(1);
    });

    it('calculates average duration correctly', () => {
      collector.recordRequest('GET', '/a', 100, 200);
      collector.recordRequest('GET', '/b', 200, 200);
      const { averageDurationMs } = collector.getSummary().performance;
      expect(averageDurationMs).toBe(150);
    });

    it('aggregates errors by type', () => {
      collector.recordError('ValidationError', 'bad input');
      collector.recordError('ValidationError', 'bad input 2');
      collector.recordError('DBError', 'timeout');
      const { errorsByType } = collector.getSummary().errors;
      expect(errorsByType['ValidationError']).toBe(2);
      expect(errorsByType['DBError']).toBe(1);
    });

    it('aggregates business events by name', () => {
      collector.recordEvent('user.registered');
      collector.recordEvent('user.registered');
      collector.recordEvent('certificate.issued');
      const { eventsByName } = collector.getSummary().business;
      expect(eventsByName['user.registered']).toBe(2);
      expect(eventsByName['certificate.issued']).toBe(1);
    });

    it('includes system metrics', () => {
      const { system } = collector.getSummary();
      expect(typeof system.uptimeSeconds).toBe('number');
      expect(typeof system.memoryUsageMB).toBe('number');
      expect(typeof system.cpuUserMs).toBe('number');
      expect(system.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('includes a collectedAt ISO timestamp', () => {
      const { collectedAt } = collector.getSummary();
      expect(new Date(collectedAt).toISOString()).toBe(collectedAt);
    });
  });

  // ── reset ────────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all metric categories', () => {
      collector.recordRequest('GET', '/a', 50, 200);
      collector.recordError('Error', 'oops');
      collector.recordEvent('user.registered');

      collector.reset();

      expect(collector.getPerformanceMetrics()).toHaveLength(0);
      expect(collector.getErrorMetrics()).toHaveLength(0);
      expect(collector.getBusinessMetrics()).toHaveLength(0);
    });

    it('resets summary counts to zero', () => {
      collector.recordRequest('GET', '/a', 50, 200);
      collector.reset();
      const summary = collector.getSummary();
      expect(summary.performance.totalRequests).toBe(0);
      expect(summary.errors.totalErrors).toBe(0);
      expect(summary.business.totalEvents).toBe(0);
    });
  });

  // ── ring-buffer trimming ─────────────────────────────────────────────────────

  describe('ring-buffer trimming', () => {
    it('does not exceed maxEntries for performance metrics', () => {
      const small = new MetricsCollector(5);
      for (let i = 0; i < 10; i++) {
        small.recordRequest('GET', `/route-${i}`, 10, 200);
      }
      expect(small.getPerformanceMetrics()).toHaveLength(5);
    });

    it('does not exceed maxEntries for error metrics', () => {
      const small = new MetricsCollector(3);
      for (let i = 0; i < 6; i++) {
        small.recordError('Error', `msg-${i}`);
      }
      expect(small.getErrorMetrics()).toHaveLength(3);
    });

    it('does not exceed maxEntries for business metrics', () => {
      const small = new MetricsCollector(4);
      for (let i = 0; i < 8; i++) {
        small.recordEvent(`event.${i}`);
      }
      expect(small.getBusinessMetrics()).toHaveLength(4);
    });

    it('keeps the most recent entries after trimming', () => {
      const small = new MetricsCollector(2);
      small.recordRequest('GET', '/old', 10, 200);
      small.recordRequest('GET', '/newer', 20, 200);
      small.recordRequest('GET', '/newest', 30, 200);
      const metrics = small.getPerformanceMetrics();
      expect(metrics.map((m) => m.route)).toEqual(['/newer', '/newest']);
    });
  });

  // ── getters return copies ────────────────────────────────────────────────────

  describe('immutable getters', () => {
    it('getPerformanceMetrics returns a copy, not the internal array', () => {
      collector.recordRequest('GET', '/a', 10, 200);
      const copy = collector.getPerformanceMetrics();
      copy.push({ method: 'DELETE', route: '/injected', durationMs: 0, statusCode: 500, timestamp: '' });
      expect(collector.getPerformanceMetrics()).toHaveLength(1);
    });
  });
});

// ─── Metrics routes integration tests ────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import metricsRouter from '../src/routes/metrics.routes.js';
import metricsCollector from '../src/metrics/MetricsCollector.js';

describe('Metrics Routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/metrics', metricsRouter);

  beforeEach(() => {
    metricsCollector.reset();
  });

  describe('GET /metrics', () => {
    it('returns 200 with a summary object', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('performance');
      expect(res.body.data).toHaveProperty('errors');
      expect(res.body.data).toHaveProperty('business');
      expect(res.body.data).toHaveProperty('system');
    });
  });

  describe('GET /metrics/performance', () => {
    it('returns an empty array when no requests recorded', async () => {
      const res = await request(app).get('/metrics/performance');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns recorded performance entries', async () => {
      metricsCollector.recordRequest('GET', '/courses', 100, 200);
      const res = await request(app).get('/metrics/performance');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].route).toBe('/courses');
    });
  });

  describe('GET /metrics/errors', () => {
    it('returns an empty array when no errors recorded', async () => {
      const res = await request(app).get('/metrics/errors');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns recorded error entries', async () => {
      metricsCollector.recordError('ValidationError', 'bad input', 400);
      const res = await request(app).get('/metrics/errors');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('ValidationError');
    });
  });

  describe('GET /metrics/business', () => {
    it('returns an empty array when no events recorded', async () => {
      const res = await request(app).get('/metrics/business');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns recorded business events', async () => {
      metricsCollector.recordEvent('user.registered', { plan: 'pro' });
      const res = await request(app).get('/metrics/business');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].event).toBe('user.registered');
    });
  });

  describe('POST /metrics/reset', () => {
    it('clears all metrics and returns success', async () => {
      metricsCollector.recordRequest('GET', '/a', 50, 200);
      metricsCollector.recordError('Error', 'oops');
      metricsCollector.recordEvent('user.registered');

      const res = await request(app).post('/metrics/reset');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify data is cleared
      const summary = await request(app).get('/metrics');
      expect(summary.body.data.performance.totalRequests).toBe(0);
      expect(summary.body.data.errors.totalErrors).toBe(0);
      expect(summary.body.data.business.totalEvents).toBe(0);
    });
  });
});
