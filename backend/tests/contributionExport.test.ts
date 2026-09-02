import request from 'supertest';
import express from 'express';
import { exportAsJSON, exportAsCSV } from '../src/services/contributionExportService.js';
import contributionExportRouter from '../src/routes/contribution-export.routes.js';

describe('contributionExportService', () => {
  describe('exportAsJSON', () => {
    it('returns the correct data shape', () => {
      const result = exportAsJSON('user-42');
      expect(result.userId).toBe('user-42');
      expect(typeof result.exportedAt).toBe('string');
      expect(new Date(result.exportedAt).toISOString()).toBe(result.exportedAt);
      expect(Array.isArray(result.contributions)).toBe(true);
      expect(result.contributions).toHaveLength(3);
      const [first] = result.contributions;
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('repo');
      expect(first).toHaveProperty('type');
      expect(first).toHaveProperty('date');
      expect(first).toHaveProperty('status');
    });
  });

  describe('exportAsCSV', () => {
    it('returns a string with CSV headers', () => {
      const result = exportAsCSV('user-42');
      expect(typeof result).toBe('string');
      const lines = result.split('\n');
      expect(lines[0]).toBe('id,repo,type,date,status');
      expect(lines).toHaveLength(4); // header + 3 rows
    });
  });
});

describe('contribution export routes', () => {
  const app = express();
  app.use('/export', contributionExportRouter);

  it('GET /export/contributions/:userId/json returns 200 with JSON content type', async () => {
    const res = await request(app).get('/export/contributions/user-1/json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.userId).toBe('user-1');
  });

  it('GET /export/contributions/:userId/csv returns 200 with CSV content type', async () => {
    const res = await request(app).get('/export/contributions/user-1/csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.text).toMatch(/^id,repo,type,date,status/);
  });
});
