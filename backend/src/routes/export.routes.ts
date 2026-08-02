import { Job } from 'bullmq';
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { verifyToken } from '../auth/auth.service.js';
import { exportQueue } from '../jobs/export.queue.js';
import { sseSessionManager } from '../sse/SseSessionManager.js';

const EXPORTS_DIR = path.join(process.cwd(), 'exports');

const router = Router();

// POST /api/v1/export - Trigger an export
router.post('/', async (req, res) => {
  const { type, format } = req.body;
  const userId = (req as unknown as { user?: { id: string } }).user?.id || 'anonymous';

  if (!['students', 'audit', 'courses'].includes(type)) {
    return res.status(400).json({ error: 'Invalid export type' });
  }

  if (!['csv', 'json'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format' });
  }

  const job = await exportQueue.add('export-job', {
    type,
    format,
    userId,
  });

  res.json({ jobId: job.id });
});

// GET /api/v1/export/events - Open SSE stream for export status updates
router.get('/events', (req, res) => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const queryToken =
    typeof req.query.access_token === 'string' ? req.query.access_token : undefined;
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  let userId: string;

  try {
    userId = verifyToken(token).userId;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write('retry: 5000\n\n');
  const clientId = sseSessionManager.addClient(userId, res);
  sseSessionManager.emitToUser(userId, 'sse_connected', {
    connected: true,
    timestamp: new Date().toISOString(),
  });

  req.on('close', () => {
    sseSessionManager.removeClient(userId, clientId);
  });
});

// GET /api/v1/export/:id/status - Get job status
router.get('/:id/status', async (req, res) => {
  const { id } = req.params;
  const job = await Job.fromId(exportQueue, id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const state = await job.getState();
  const progress = job.progress;
  const result = job.returnvalue;

  res.json({
    id: job.id,
    state,
    progress,
    result,
  });
});

// GET /api/v1/export/download/:fileName - Download the generated file
router.get('/download/:fileName', (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(EXPORTS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Check if file is older than 24 hours
  const stats = fs.statSync(filePath);
  const now = new Date().getTime();
  const endTime = new Date(stats.ctime).getTime() + 24 * 60 * 60 * 1000;

  if (now > endTime) {
    fs.unlinkSync(filePath);
    return res.status(410).json({ error: 'File has expired' });
  }

  res.download(filePath);
});

export default router;
