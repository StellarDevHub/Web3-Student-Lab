import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import policyRouter from '../src/routes/policy/policy.routes.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/policy', policyRouter);
  return app;
};

describe('Policy Routes Integration', () => {
  const app = createTestApp();

  const vulnerableCode = `use std::collections::HashMap;
pub fn bad() { panic!("fail"); }`;

  const safeCode = `#![no_std]
use soroban_sdk::{contract, contractimpl, symbol, Env, Symbol};`;

  describe('GET /api/v1/policy/version', () => {
    it('returns policy system version and metadata', async () => {
      const res = await request(app).get('/api/v1/policy/version');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('systemVersion');
      expect(res.body.data).toHaveProperty('policies');
      expect(res.body.data.policies.total).toBeGreaterThan(0);
      expect(res.body.data.policies.enabled).toBeGreaterThan(0);
      expect(res.body.data.policies.available[0]).toHaveProperty('id');
      expect(res.body.data.policies.available[0]).toHaveProperty('version');
    });
  });

  describe('GET /api/v1/policy/policies', () => {
    it('returns all available policies', async () => {
      const res = await request(app).get('/api/v1/policy/policies');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.policies)).toBe(true);
      expect(res.body.data.policies.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/policy/policies/enabled', () => {
    it('returns only enabled policies', async () => {
      const res = await request(app).get('/api/v1/policy/policies/enabled');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.policies)).toBe(true);
    });
  });

  describe('GET /api/v1/policy/policies/:policyId', () => {
    it('returns policy details for existing policy', async () => {
      const res = await request(app).get('/api/v1/policy/policies/soroban-security-baseline');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.policy.id).toBe('soroban-security-baseline');
    });

    it('returns 404 for non-existent policy', async () => {
      const res = await request(app).get('/api/v1/policy/policies/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
    });
  });

  describe('POST /api/v1/policy/scan', () => {
    it('scans vulnerable code and returns findings', async () => {
      const res = await request(app)
        .post('/api/v1/policy/scan')
        .send({ sourceCode: vulnerableCode });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.result.findings.length).toBeGreaterThan(0);
      expect(res.body.data.result.findings.some((f: any) => f.rule === 'std-import')).toBe(true);
      expect(res.body.data.result.findings.some((f: any) => f.rule === 'panic-usage')).toBe(true);
      expect(res.body.data.result.score).toBeLessThan(100);
    });

    it('returns clean scan for safe code', async () => {
      const res = await request(app)
        .post('/api/v1/policy/scan')
        .send({ sourceCode: safeCode });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.result.findings).toHaveLength(0);
      expect(res.body.data.result.score).toBe(100);
      expect(res.body.data.result.summary).toContain('No vulnerabilities');
    });

    it('returns 400 for empty source code', async () => {
      const res = await request(app)
        .post('/api/v1/policy/scan')
        .send({ sourceCode: '' });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    it('returns 400 for missing source code', async () => {
      const res = await request(app)
        .post('/api/v1/policy/scan')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    it('returns 400 for oversized source code', async () => {
      const res = await request(app)
        .post('/api/v1/policy/scan')
        .send({ sourceCode: 'x'.repeat(50001) });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    it('supports specific policy IDs', async () => {
      const res = await request(app)
        .post('/api/v1/policy/scan')
        .send({ sourceCode: vulnerableCode, policyIds: ['soroban-security-baseline'] });

      expect(res.status).toBe(200);
      expect(res.body.data.result.findings.length).toBeGreaterThan(0);
    });

    it('returns 400 for unknown policy ID in strict mode', async () => {
      const res = await request(app)
        .post('/api/v1/policy/scan')
        .send({
          sourceCode: vulnerableCode,
          policyIds: ['nonexistent'],
          options: { strictMode: true },
        });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    it('produces deterministic findings for the same input', async () => {
      const res1 = await request(app)
        .post('/api/v1/policy/scan')
        .send({ sourceCode: vulnerableCode });

      const res2 = await request(app)
        .post('/api/v1/policy/scan')
        .send({ sourceCode: vulnerableCode });

      expect(res1.body.data.result.findings).toEqual(res2.body.data.result.findings);
      expect(res1.body.data.result.score).toBe(res2.body.data.result.score);
    });
  });

  describe('POST /api/v1/policy/validate', () => {
    it('validates a correct policy definition', async () => {
      const res = await request(app)
        .post('/api/v1/policy/validate')
        .send({
          policy: {
            id: 'test-policy',
            name: 'Test Policy',
            version: '1.0.0',
            rules: [
              {
                id: 'test-rule',
                pattern: /test/,
                severity: 'high',
                message: 'test message',
                remediation: 'test remediation',
              },
            ],
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.validation.valid).toBe(true);
    });

    it('rejects an invalid policy definition', async () => {
      const res = await request(app)
        .post('/api/v1/policy/validate')
        .send({
          policy: {
            id: '',
            name: '',
            version: '',
            rules: [],
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.validation.valid).toBe(false);
    });

    it('returns 400 for missing policy', async () => {
      const res = await request(app)
        .post('/api/v1/policy/validate')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });
});
